const express   = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode    = require('qrcode');

const app = express();
app.use(express.json());

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
            headless : true,  // 🔥 CHANGED: Must be true for production
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

    this.client.on('ready', () => {
      this.isReady = true;
      this.qrText = this.qrImage = null;
      console.log('✅ WhatsApp session active');
    });

    this.client.on('auth_failure', () => {
      console.log('❌ Authentication failed');
      this.reset();
    });
    
    this.client.on('disconnected', (reason) => {
      console.log('❌ Client disconnected:', reason);
      this.reset();
    });
  }

  getStatus () {
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
    if (!this.isReady) throw new Error('Client not ready – generate and scan QR first');

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

// Routes (same as before)
app.post('/api/qr/generate', async (req, res) => {
  try {
    if (wa.isReady) {
      return res.json({
        success: true,
        status: 'ready',
        message: 'WhatsApp already connected'
      });
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
    await new Promise(r => setTimeout(r, 2000));
    
    const status = wa.getStatus();
    res.json(status);

  } catch (e) {
    res.status(500).json({ 
      success: false, 
      error: e.message,
      status: 'error'
    });
  }
});

app.get('/api/qr', (req, res) => {
  const status = wa.getStatus();
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
    res.status(500).json({ success: false, error: e.message }); 
  }
});

app.post('/api/messages/last24h', async (req, res) => {
  try {
    const chatFilter = req.body?.chat || null;
    const messages = await wa.fetchLast24h(chatFilter);
    
    res.json({ 
      success: true, 
      total: messages.length, 
      chatFilter: chatFilter,
      messages: messages 
    });
  } catch (e) {
    console.error('❌ API Error:', e.message);
    res.status(503).json({ success: false, error: e.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'Server running',
    timestamp: new Date().toISOString(),
    whatsapp: wa.getStatus()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp API Server running on port ${PORT}`);
  console.log(`📡 Production API endpoints available`);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  if (wa.client) {
    await wa.client.destroy();
  }
  process.exit(0);
});
