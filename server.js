const express   = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode    = require('qrcode');

const app = express();

// 🔥 IMPROVED JSON MIDDLEWARE with error handling
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      if (buf && buf.length) JSON.parse(buf);
    } catch (e) {
      res.status(400).json({
        success: false,
        error: 'Invalid JSON in request body'
      });
      throw new Error('Invalid JSON');
    }
  }
}));

// 🔥 Global error handler for JSON parsing
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON format in request body'
    });
  }
  next();
});

class WhatsAppAPI {
  constructor () {
    this.client                 = null;
    this.isReady                = false;
    this.initializing           = false;
    this.qrText                 = null;
    this.qrImage                = null;
  }

  async reset () { 
    this.isReady = false; 
    this.qrText = this.qrImage = null; 
  }

  async logout () { 
    if (this.client) { 
      console.log('🔓 Logging out...');
      await this.client.logout(); 
      await this.client.destroy();
      this.client = null;
      this.reset(); 
    } 
  }

  async initClient (retries = 2) {
    if (this.initializing) {
      throw new Error('Client initialization already in progress');
    }
    
    this.initializing = true;

    for (let a = 1; a <= retries; a++) {
      try {
        if (this.client) await this.client.destroy();

        this.client = new Client({
          authStrategy   : new LocalAuth(),
          puppeteer      : {
            headless : true,
            args     : [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
              '--disable-web-security',
              '--disable-features=VizDisplayCompositor'
            ],
            timeout  : 90_000
          },
          webVersionCache: { type: 'none' }
        });

        this.attachEvents();
        await this.client.initialize();
        break;

      } catch (e) {
        console.error(`[Init-${a}] ${e.message}`);
        if (a === retries) {
          this.initializing = false;
          throw e;
        }
        await new Promise(r => setTimeout(r, 10_000));
      }
    }
    this.initializing = false;
  }

  attachEvents () {
    this.client.on('qr', async qr => {
      this.qrText  = qr;
      
      try {
        this.qrImage = await qrcode.toDataURL(qr, { width: 300 });
        console.log('🔑 QR code generated and ready for API access');
      } catch (err) {
        console.error('❌ QR image generation failed:', err);
      }
    });

    // 🔥 IMPROVED: Better ready state handling
    this.client.on('ready', () => {
      this.isReady = true;
      this.qrText = this.qrImage = null;
      console.log('✅ WhatsApp session active');
      
      // 🔥 Force clear QR data after connection
      setTimeout(() => {
        if (this.isReady) {
          this.qrText = this.qrImage = null;
        }
      }, 2000);
    });

    this.client.on('auth_failure', () => {
      console.log('❌ Authentication failed');
      this.reset();
    });
    
    this.client.on('disconnected', (reason) => {
      console.log('❌ Client disconnected:', reason);
      this.reset();
    });

    // 🔥 NEW: Additional connection monitoring
    this.client.on('change_state', (state) => {
      console.log(`🔄 WhatsApp state: ${state}`);
      if (state === 'CONNECTED') {
        this.isReady = true;
        this.qrText = this.qrImage = null;
      }
    });
  }

  // 🔥 IMPROVED: Better status checking with actual client state
  async getStatus () {
    // Check actual client state if available
    if (this.client) {
      try {
        const clientState = await this.client.getState();
        if (clientState === 'CONNECTED') {
          this.isReady = true;
          this.qrText = this.qrImage = null;
        }
      } catch (error) {
        console.log('⚠️ Could not get client state:', error.message);
      }
    }

    if (this.isReady) {
      return { 
        success: true,
        status: 'ready', 
        message: 'WhatsApp is connected and ready' 
      };
    }
    
    if (this.qrText) {
      return { 
        success: true,
        status: 'waiting_for_scan', 
        qrText: this.qrText, 
        qrImage: this.qrImage,
        message: 'QR code available - scan with WhatsApp mobile app'
      };
    }

    if (this.initializing) {
      return {
        success: false,
        status: 'initializing',
        message: 'Initializing WhatsApp client...'
      };
    }
    
    return { 
      success: false,
      status: 'offline',
      message: 'Client not initialized. Call /api/qr/generate to start'
    };
  }

  async fetchLast24h (chatQuery = null) {
    // 🔥 IMPROVED: Check actual client state
    if (!this.client) {
      throw new Error('Client not initialized - generate QR first');
    }

    try {
      const clientState = await this.client.getState();
      if (clientState !== 'CONNECTED') {
        throw new Error(`Client not connected (state: ${clientState}) - scan QR code first`);
      }
    } catch (error) {
      throw new Error('Client not ready - generate and scan QR first');
    }

    console.log('🔍 Fetching last 24h messages...');
    
    const since = Date.now() - 86_400_000;
    const chats = await this.client.getChats();
    
    console.log(`📱 Total chats found: ${chats.length}`);

    const target = chatQuery
      ? chats.filter(c => {
          const q = chatQuery.toLowerCase();
          return (c.name && c.name.toLowerCase().includes(q)) ||
                 c.id._serialized.includes(q);
        })
      : chats.filter(c => c.unreadCount > 0).slice(0, 10);

    console.log(`📬 Processing ${target.length} chats${chatQuery ? ` (filtered by: ${chatQuery})` : ' (unread only)'}`);

    const out = [];

    for (let i = 0; i < target.length; i++) {
      const c = target[i];
      console.log(`💬 Processing ${i+1}/${target.length}: ${c.name || 'Unknown'}`);
      
      try {
        const msgs = await c.fetchMessages({ limit: 20 });
        const filtered = msgs
          .filter(m => m.timestamp * 1000 >= since)
          .map(m => ({
            messageId  : m.id.id,
            chatName   : c.name || 'Individual Chat',
            chatType   : c.isGroup ? 'Group' : 'Individual',
            from       : m.fromMe ? 'You' : (m.author || m.from),
            body       : m.body || '[Media content]',
            timestamp  : new Date(m.timestamp * 1000).toISOString(),
            type       : m.type,
            hasMedia   : m.hasMedia,
            isFromMe   : m.fromMe
          }));
        
        out.push(...filtered);
        console.log(`   📝 Found ${filtered.length} messages in last 24h`);
        
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.log(`   ❌ Error processing chat: ${err.message}`);
      }
    }
    
    console.log(`✅ Total messages collected: ${out.length}`);
    return out;
  }
}

const wa = new WhatsAppAPI();

// 🔥 ROUTES with improved error handling

app.post('/api/qr/generate', async (req, res) => {
  try {
    // Check if already connected
    if (wa.client) {
      try {
        const state = await wa.client.getState();
        if (state === 'CONNECTED') {
          return res.json({
            success: true,
            status: 'ready',
            message: 'WhatsApp already connected'
          });
        }
      } catch (error) {
        console.log('⚠️ Could not check client state:', error.message);
      }
    }

    if (wa.initializing) {
      return res.json({
        success: false,
        status: 'initializing',
        message: 'QR generation in progress, please wait...'
      });
    }

    console.log('🔄 Starting WhatsApp client for QR generation...');
    await wa.initClient();
    await new Promise(r => setTimeout(r, 3000)); // Wait longer for QR generation
    
    const status = await wa.getStatus();
    res.json(status);

  } catch (e) {
    console.error('❌ QR Generate Error:', e.message);
    res.status(500).json({ 
      success: false, 
      error: e.message,
      status: 'error'
    });
  }
});

app.get('/api/qr', async (req, res) => {
  const status = await wa.getStatus();
  res.json(status);
});

app.get('/api/qr/image', (req, res) => {
  if (!wa.qrImage) {
    return res.status(404).json({
      success: false,
      message: 'No QR code available. Call POST /api/qr/generate first'
    });
  }

  const base64Data = wa.qrImage.replace(/^data:image\/png;base64,/, '');
  const imgBuffer = Buffer.from(base64Data, 'base64');
  
  res.contentType('image/png');
  res.send(imgBuffer);
});

app.post('/api/logout', async (req, res) => {
  try {
    await wa.logout();
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (e) { 
    console.error('❌ Logout Error:', e.message);
    res.status(500).json({ success: false, error: e.message }); 
  }
});

app.post('/api/messages/last24h', async (req, res) => {
  try {
    // Handle empty or missing body gracefully
    const requestBody = req.body || {};
    const chatFilter = requestBody.chat || null;
    
    console.log('📡 Messages request received:', { chatFilter });
    
    const messages = await wa.fetchLast24h(chatFilter);
    
    res.json({ 
      success: true, 
      total: messages.length, 
      chatFilter: chatFilter,
      messages: messages 
    });
  } catch (e) {
    console.error('❌ Messages API Error:', e.message);
    res.status(503).json({ success: false, error: e.message });
  }
});

// 🔥 NEW: Debug endpoint to check actual client state
app.get('/api/debug/status', async (req, res) => {
  try {
    let actualState = 'no_client';
    let isConnected = false;
    
    if (wa.client) {
      try {
        actualState = await wa.client.getState();
        isConnected = actualState === 'CONNECTED';
      } catch (error) {
        actualState = 'error: ' + error.message;
      }
    }
    
    res.json({
      clientExists: !!wa.client,
      internalReady: wa.isReady,
      actualState: actualState,
      isConnected: isConnected,
      hasQR: !!wa.qrText,
      initializing: wa.initializing
    });
  } catch (error) {
    res.json({
      error: error.message,
      clientExists: !!wa.client,
      internalReady: wa.isReady
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'Server running',
    timestamp: new Date().toISOString(),
    whatsapp: wa.isReady ? { status: 'ready' } : { status: 'not_ready' }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp API Server running on port ${PORT}`);
  console.log(`📡 API Endpoints:`);
  console.log(`   POST /api/qr/generate - Generate QR code`);
  console.log(`   GET  /api/qr - Check status`);
  console.log(`   GET  /api/qr/image - Get QR image`);
  console.log(`   POST /api/messages/last24h - Fetch messages`);
  console.log(`   POST /api/logout - Logout`);
  console.log(`   GET  /api/debug/status - Debug connection`);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  if (wa.client) {
    await wa.client.destroy();
  }
  process.exit(0);
});
