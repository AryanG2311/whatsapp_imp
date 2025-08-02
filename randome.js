// const { Client, LocalAuth } = require('whatsapp-web.js');
// const fs = require('fs');
// const path = require('path');
// const readline = require('readline');

// class WhatsAppMessageFetcher {
//     constructor() {
//         this.client = new Client({
//             authStrategy: new LocalAuth(),
//             puppeteer: { 
//                 headless: false,
//                 args: ['--no-sandbox', '--disable-setuid-sandbox']
//             },
//             webVersionCache: { type: 'none' }
//         });
        
//         this.allMessages = [];
//         this.setupEventListeners();
//     }
    
//     setupEventListeners() {
//         this.client.on('qr', (qr) => {
//             console.log('📱 Scan this QR code with your WhatsApp:');
//             console.log(qr);
//         });
        
//         this.client.on('ready', () => {
//             console.log('✅ WhatsApp Client is ready!');
//             this.startFetching();
//         });
        
//         this.client.on('auth_failure', (msg) => {
//             console.error('❌ Authentication failed:', msg);
//         });
//     }
    
//     async startFetching() {
//         const rl = readline.createInterface({
//             input: process.stdin,
//             output: process.stdout
//         });
        
//         console.log('\n📅 Select timeframe for fetching messages:');
//         console.log('1. Today only');
//         console.log('2. Yesterday');
//         console.log('3. Last 24 hours');
//         console.log('4. Last 3 days');
//         console.log('5. This week');
        
//         rl.question('\nEnter your choice (1-5): ', async (answer) => {
//             const timeframes = {
//                 '1': 'today',
//                 '2': 'yesterday',
//                 '3': 'last24hours',
//                 '4': 'last3days',
//                 '5': 'thisweek'
//             };
            
//             const selectedTimeframe = timeframes[answer] || 'today';
//             console.log(`\n⏰ Selected: ${selectedTimeframe}`);
            
//             rl.close();
//             await this.fetchMessages(selectedTimeframe);
//         });
//     }
    
//     async fetchMessages(timeframe) {
//         try {
//             console.log('\n🔍 Starting message fetch...');
            
//             // Get all chats
//             const allChats = await this.client.getChats();
//             console.log(`📱 Total chats found: ${allChats.length}`);
            
//             // Filter for unread chats only (more efficient)
//             const unreadChats = allChats.filter(chat => chat.unreadCount > 0);
//             console.log(`📬 Chats with unread messages: ${unreadChats.length}`);
            
//             const { startTime, endTime } = this.parseTimeframe(timeframe);
//             console.log(`📅 Fetching from: ${startTime.toLocaleString()}`);
//             console.log(`📅 Fetching to: ${endTime.toLocaleString()}\n`);
            
//             // Process each unread chat
//             for (let i = 0; i < unreadChats.length; i++) {
//                 const chat = unreadChats[i];
//                 console.log(`💬 Processing ${i+1}/${unreadChats.length}: ${chat.name || 'Unknown'}`);
                
//                 try {
//                     await this.fetchChatMessages(chat, startTime, endTime);
                    
//                     // Small delay to avoid rate limiting
//                     await new Promise(resolve => setTimeout(resolve, 800));
                    
//                 } catch (error) {
//                     console.log(`❌ Error: ${error.message}`);
//                 }
//             }
            
//             // Save all messages to JSON file
//             await this.saveMessagesToFile(timeframe);
            
//         } catch (error) {
//             console.error('❌ Error fetching messages:', error);
//         }
//     }
    
//     async fetchChatMessages(chat, startTime, endTime) {
//         try {
//             // Fetch messages (limit to unread count or max 50)
//             const messageLimit = Math.min(chat.unreadCount, 50);
//             const messages = await chat.fetchMessages({ limit: messageLimit });
            
//             // Filter messages by timeframe
//             const timeFilteredMessages = messages.filter(msg => {
//                 const msgTime = new Date(msg.timestamp * 1000);
//                 return msgTime >= startTime && msgTime <= endTime;
//             });
            
//             console.log(`   📝 Found ${timeFilteredMessages.length} messages in timeframe`);
            
//             // Process each message
//             for (const msg of timeFilteredMessages) {
//                 const messageData = await this.processMessage(msg, chat);
//                 this.allMessages.push(messageData);
//             }
            
//         } catch (error) {
//             console.log(`   ❌ Error fetching messages: ${error.message}`);
//         }
//     }
    
//     async processMessage(msg, chat) {
//         const contact = await msg.getContact();
//         const timestamp = new Date(msg.timestamp * 1000);
        
//         const messageData = {
//             id: msg.id.id,
//             from: contact.name || contact.pushname || msg.from,
//             fromNumber: msg.from,
//             chatName: chat.name || 'Individual Chat',
//             chatType: chat.isGroup ? 'Group' : 'Individual',
//             timestamp: timestamp.toISOString(),
//             timestampUnix: msg.timestamp,
//             body: msg.body || '',
//             type: msg.type,
//             hasMedia: msg.hasMedia,
//             mediaInfo: null,
//             mentionedIds: msg.mentionedIds || [],
//             isFromMe: msg.fromMe
//         };
        
//         // Download media if present
//         if (msg.hasMedia) {
//             try {
//                 const media = await msg.downloadMedia();
//                 messageData.mediaInfo = {
//                     filename: media.filename || `media_${Date.now()}`,
//                     mimetype: media.mimetype,
//                     size: media.data.length
//                 };
                
//                 // Save media file
//                 await this.saveMediaFile(media, messageData);
                
//                 console.log(`     📎 Media: ${messageData.mediaInfo.filename}`);
                
//             } catch (error) {
//                 console.log(`     ❌ Media download failed: ${error.message}`);
//             }
//         }
        
//         return messageData;
//     }
    
//     async saveMediaFile(media, messageData) {
//         const mediaDir = './fetched_media';
//         if (!fs.existsSync(mediaDir)) {
//             fs.mkdirSync(mediaDir, { recursive: true });
//         }
        
//         const timestamp = new Date(messageData.timestamp).toISOString().slice(0, 10);
//         const sanitizedChat = messageData.chatName.replace(/[^a-zA-Z0-9]/g, '_');
//         const extension = media.mimetype.split('/')[1] || 'bin';
//         const filename = `${timestamp}_${sanitizedChat}_${Date.now()}.${extension}`;
//         const filepath = path.join(mediaDir, filename);
        
//         fs.writeFileSync(filepath, media.data, 'base64');
        
//         messageData.mediaInfo.savedPath = filepath;
//         messageData.mediaInfo.filename = filename;
//     }
    
//     parseTimeframe(timeframe) {
//         const now = new Date();
//         let startTime, endTime = now;
        
//         switch(timeframe.toLowerCase()) {
//             case 'today':
//                 startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
//                 break;
//             case 'yesterday':
//                 startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
//                 endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
//                 break;
//             case 'last24hours':
//                 startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
//                 break;
//             case 'last3days':
//                 startTime = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
//                 break;
//             case 'thisweek':
//                 const dayOfWeek = now.getDay();
//                 startTime = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
//                 startTime.setHours(0, 0, 0, 0);
//                 break;
//             default:
//                 startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
//         }
        
//         return { startTime, endTime };
//     }
    
//     async saveMessagesToFile(timeframe) {
//         const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
//         const filename = `whatsapp_messages_${timeframe}_${timestamp}.json`;
//         const filepath = `./messages_${filename}`;
        
//         const output = {
//             metadata: {
//                 fetchedAt: new Date().toISOString(),
//                 timeframe: timeframe,
//                 totalMessages: this.allMessages.length,
//                 chatsProcessed: [...new Set(this.allMessages.map(m => m.chatName))].length,
//                 messagesWithMedia: this.allMessages.filter(m => m.hasMedia).length
//             },
//             messages: this.allMessages
//         };
        
//         fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
        
//         console.log('\n✅ FETCH COMPLETE!');
//         console.log('==================');
//         console.log(`📊 Total messages fetched: ${this.allMessages.length}`);
//         console.log(`📱 Chats processed: ${output.metadata.chatsProcessed}`);
//         console.log(`📎 Messages with media: ${output.metadata.messagesWithMedia}`);
//         console.log(`💾 Data saved to: ${filepath}`);
//         console.log(`📁 Media files saved to: ./fetched_media/`);
        
//         console.log('\n📋 Sample message structure:');
//         if (this.allMessages.length > 0) {
//             console.log(JSON.stringify(this.allMessages[0], null, 2));
//         }
//     }
    
//     async start() {
//         console.log('🚀 Starting WhatsApp Message Fetcher...');
//         await this.client.initialize();
//     }
// }

// // Start the application
// const fetcher = new WhatsAppMessageFetcher();
// fetcher.start();

// // Graceful shutdown
// process.on('SIGINT', async () => {
//     console.log('\n🛑 Shutting down...');
//     await fetcher.client.destroy();
//     process.exit(0);
// });

// const express = require('express');
// const { Client, LocalAuth } = require('whatsapp-web.js');
// const fs = require('fs');
// const path = require('path');

// const app = express();
// app.use(express.json());

// class WhatsAppAPI {
//     constructor() {
//         this.client = null;
//         this.isClientReady = false;
//         this.initializationInProgress = false;
//         this.initializeClient();
//     }
    
//     async initializeClient(retries = 3) {
//         if (this.initializationInProgress) {
//             console.log('⏳ Initialization already in progress...');
//             return;
//         }
        
//         this.initializationInProgress = true;
        
//         for (let attempt = 1; attempt <= retries; attempt++) {
//             try {
//                 console.log(`🔄 Attempt ${attempt}/${retries} to initialize WhatsApp client...`);
                
//                 // Destroy existing client if any
//                 if (this.client) {
//                     await this.client.destroy();
//                 }
                
//                 this.client = new Client({
//                     authStrategy: new LocalAuth(),
//                     puppeteer: { 
//                         headless: true,
//                         args: [
//                             '--no-sandbox', 
//                             '--disable-setuid-sandbox',
//                             '--disable-dev-shm-usage',
//                             '--disable-accelerated-2d-canvas',
//                             '--no-first-run',
//                             '--no-zygote',
//                             '--disable-gpu'
//                         ],
//                         timeout: 90000, // 90 seconds
//                         protocolTimeout: 90000
//                     },
//                     webVersionCache: { type: 'none' },
//                     takeoverOnConflict: true,
//                     takeoverTimeoutMs: 60000
//                 });
                
//                 this.setupEventListeners();
                
//                 // Initialize with timeout
//                 await Promise.race([
//                     this.client.initialize(),
//                     new Promise((_, reject) => 
//                         setTimeout(() => reject(new Error('Initialization timeout after 90 seconds')), 90000)
//                     )
//                 ]);
                
//                 console.log('✅ Client initialization completed successfully');
//                 break; // Success, exit retry loop
                
//             } catch (error) {
//                 console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
                
//                 if (attempt === retries) {
//                     this.initializationInProgress = false;
//                     throw new Error(`Failed to initialize after ${retries} attempts: ${error.message}`);
//                 }
                
//                 // Wait before retry
//                 console.log(`⏳ Waiting 10 seconds before retry...`);
//                 await new Promise(resolve => setTimeout(resolve, 10000));
//             }
//         }
        
//         this.initializationInProgress = false;
//     }
    
//     setupEventListeners() {
//         this.client.on('qr', (qr) => {
//             console.log('📱 QR Code generated. Scan with WhatsApp:');
//             console.log(qr);
//         });
        
//         this.client.on('ready', () => {
//             console.log('✅ WhatsApp Client is ready!');
//             this.isClientReady = true;
//         });
        
//         this.client.on('auth_failure', (msg) => {
//             console.error('❌ Authentication failed:', msg);
//             this.isClientReady = false;
//         });
        
//         this.client.on('disconnected', (reason) => {
//             console.log('❌ Client disconnected:', reason);
//             this.isClientReady = false;
            
//             // Auto-reconnect after 5 seconds
//             setTimeout(() => {
//                 if (!this.isClientReady && !this.initializationInProgress) {
//                     console.log('🔄 Attempting to reconnect...');
//                     this.initializeClient();
//                 }
//             }, 5000);
//         });
        
//         this.client.on('loading_screen', (percent, message) => {
//             console.log(`⏳ Loading: ${percent}% - ${message}`);
//         });
        
//         this.client.on('change_state', (state) => {
//             console.log(`🔄 State changed: ${state}`);
//         });
//     }
    
//     async fetchLastDayMessages() {
//         if (!this.isClientReady) {
//             throw new Error('WhatsApp client not ready. Please scan QR code first.');
//         }
        
//         try {
//             // Calculate 24 hours ago
//             const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
//             const now = new Date();
            
//             console.log(`🔍 Fetching messages from last 24 hours...`);
            
//             // Get all chats with timeout
//             const allChats = await Promise.race([
//                 this.client.getChats(),
//                 new Promise((_, reject) => 
//                     setTimeout(() => reject(new Error('Timeout getting chats')), 30000)
//                 )
//             ]);
            
//             const unreadChats = allChats
//                 .filter(chat => chat.unreadCount > 0)
//                 .slice(0, 10); // Limit to top 50 unread chats
            
//             console.log(`📬 Processing ${unreadChats.length} unread chats`);
            
//             const allMessages = [];
            
//             // Process each unread chat
//             for (let i = 0; i < unreadChats.length; i++) {
//                 const chat = unreadChats[i];
//                 console.log(`💬 Processing ${i+1}/${unreadChats.length}: ${chat.name || 'Unknown'}`);
                
//                 try {
//                     // Fetch messages with timeout
//                     const messageLimit = Math.min(chat.unreadCount, 20);
//                     const messages = await Promise.race([
//                         chat.fetchMessages({ limit: messageLimit }),
//                         new Promise((_, reject) => 
//                             setTimeout(() => reject(new Error('Timeout fetching messages')), 15000)
//                         )
//                     ]);
                    
//                     // Filter messages from last 24 hours
//                     const dayFilteredMessages = messages.filter(msg => {
//                         const msgTime = new Date(msg.timestamp * 1000);
//                         return msgTime >= oneDayAgo && msgTime <= now;
//                     });
                    
//                     // Process each message
//                     for (const msg of dayFilteredMessages) {
//                         try {
//                             const messageData = await Promise.race([
//                                 this.processMessage(msg, chat),
//                                 new Promise((_, reject) => 
//                                     setTimeout(() => reject(new Error('Timeout processing message')), 10000)
//                                 )
//                             ]);
//                             allMessages.push(messageData);
//                         } catch (msgError) {
//                             console.log(`   ⚠️ Skipped message due to timeout: ${msgError.message}`);
//                         }
//                     }
                    
//                     console.log(`   📝 Found ${dayFilteredMessages.length} messages in last 24h`);
                    
//                     // Small delay to avoid rate limiting
//                     await new Promise(resolve => setTimeout(resolve, 500));
                    
//                 } catch (error) {
//                     console.log(`   ❌ Error processing chat: ${error.message}`);
//                 }
//             }
            
//             return {
//                 success: true,
//                 metadata: {
//                     fetchedAt: new Date().toISOString(),
//                     timeframe: 'last24hours',
//                     totalMessages: allMessages.length,
//                     chatsProcessed: unreadChats.length,
//                     messagesWithMedia: allMessages.filter(m => m.hasMedia).length,
//                     fromTime: oneDayAgo.toISOString(),
//                     toTime: now.toISOString()
//                 },
//                 messages: allMessages
//             };
            
//         } catch (error) {
//             throw new Error(`Failed to fetch messages: ${error.message}`);
//         }
//     }
    
//     async processMessage(msg, chat) {
//         const contact = await msg.getContact();
//         const timestamp = new Date(msg.timestamp * 1000);
        
//         const messageData = {
//             id: msg.id.id,
//             from: contact.name || contact.pushname || msg.from,
//             fromNumber: msg.from,
//             chatName: chat.name || 'Individual Chat',
//             chatType: chat.isGroup ? 'Group' : 'Individual',
//             timestamp: timestamp.toISOString(),
//             timestampUnix: msg.timestamp,
//             body: msg.body || '',
//             type: msg.type,
//             hasMedia: msg.hasMedia,
//             mediaInfo: null,
//             mentionedIds: msg.mentionedIds || [],
//             isFromMe: msg.fromMe
//         };
        
//         // For API, we'll skip media download to keep response fast
//         if (msg.hasMedia) {
//             messageData.mediaInfo = {
//                 hasMedia: true,
//                 type: msg.type,
//                 note: 'Media not downloaded in API response for performance'
//             };
//         }
        
//         return messageData;
//     }
    
//     async logout() {
//         try {
//             if (this.client && this.isClientReady) {
//                 console.log('🔓 Logging out from WhatsApp...');
//                 await this.client.logout();
//                 this.isClientReady = false;
//                 console.log('✅ Logged out successfully');
//                 return { success: true, message: 'Logged out successfully' };
//             } else {
//                 return { success: false, message: 'Client not ready or already logged out' };
//             }
//         } catch (error) {
//             console.error('❌ Logout error:', error.message);
//             return { success: false, error: error.message };
//         }
//     }
    
//     async restart() {
//         try {
//             console.log('🔄 Restarting WhatsApp client...');
//             this.isClientReady = false;
            
//             if (this.client) {
//                 await this.client.destroy();
//             }
            
//             await this.initializeClient();
//             return { success: true, message: 'Client restarted successfully' };
//         } catch (error) {
//             console.error('❌ Restart error:', error.message);
//             return { success: false, error: error.message };
//         }
//     }
    
//     getClientStatus() {
//         return {
//             isReady: this.isClientReady,
//             status: this.isClientReady ? 'Connected' : 'Not Connected',
//             initializationInProgress: this.initializationInProgress
//         };
//     }
// }

// // Initialize WhatsApp API
// const whatsappAPI = new WhatsAppAPI();

// // API Routes with better error handling
// app.get('/api/status', (req, res) => {
//     const status = whatsappAPI.getClientStatus();
//     res.json(status);
// });

// app.get('/api/messages/last24h', async (req, res) => {
//     // Set longer timeout for this route
//     req.setTimeout(180000); // 3 minutes
    
//     try {
//         if (!whatsappAPI.isClientReady) {
//             return res.status(503).json({
//                 success: false,
//                 error: 'WhatsApp client not ready. Please ensure QR code is scanned.',
//                 status: 'not_ready'
//             });
//         }
        
//         console.log('📡 API request received for last 24h messages');
        
//         // Add timeout wrapper for the entire operation
//         const result = await Promise.race([
//             whatsappAPI.fetchLastDayMessages(),
//             new Promise((_, reject) => 
//                 setTimeout(() => reject(new Error('Operation timeout after 3 minutes')), 180000)
//             )
//         ]);
        
//         res.json(result);
        
//     } catch (error) {
//         console.error('❌ API Error:', error.message);
        
//         if (error.message.includes('timeout') || error.message.includes('Timeout')) {
//             res.status(408).json({
//                 success: false,
//                 error: 'Request timeout. Please try again.',
//                 errorType: 'timeout'
//             });
//         } else {
//             res.status(500).json({
//                 success: false,
//                 error: error.message
//             });
//         }
//     }
// });

// app.get('/api/qr', (req, res) => {
//     if (whatsappAPI.isClientReady) {
//         return res.json({
//             success: true,
//             message: 'Client already authenticated',
//             status: 'ready'
//         });
//     }
    
//     res.json({
//         success: false,
//         message: 'QR code needed. Check server console for QR code.',
//         status: 'needs_qr'
//     });
// });

// // NEW: Logout route
// app.post('/api/logout', async (req, res) => {
//     try {
//         const result = await whatsappAPI.logout();
        
//         if (result.success) {
//             res.json(result);
//         } else {
//             res.status(400).json(result);
//         }
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             error: error.message
//         });
//     }
// });

// // NEW: Restart client route
// app.post('/api/restart', async (req, res) => {
//     try {
//         const result = await whatsappAPI.restart();
        
//         if (result.success) {
//             res.json(result);
//         } else {
//             res.status(500).json(result);
//         }
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             error: error.message
//         });
//     }
// });

// // Health check endpoint
// app.get('/health', (req, res) => {
//     res.json({ 
//         status: 'Server running',
//         timestamp: new Date().toISOString(),
//         whatsapp: whatsappAPI.getClientStatus()
//     });
// });

// const PORT = process.env.PORT || 3000;

// app.listen(PORT, () => {
//     console.log(`🚀 WhatsApp API Server running on port ${PORT}`);
//     console.log(`📡 Endpoints:`);
//     console.log(`   GET /health - Health check`);
//     console.log(`   GET /api/status - WhatsApp connection status`);
//     console.log(`   GET /api/messages/last24h - Fetch last 24h messages`);
//     console.log(`   GET /api/qr - QR code status`);
//     console.log(`   POST /api/logout - Logout from WhatsApp`);
//     console.log(`   POST /api/restart - Restart WhatsApp client`);
// });

// // Graceful shutdown
// process.on('SIGINT', async () => {
//     console.log('\n🛑 Shutting down server...');
//     if (whatsappAPI.client) {
//         await whatsappAPI.client.destroy();
//     }
//     process.exit(0);
// });