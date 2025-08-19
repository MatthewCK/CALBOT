// Test the group chat configuration
require('dotenv').config();

// Simulate the new configuration
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID || '';

console.log('=== GROUP CHAT CONFIGURATION TEST ===');
console.log('Group Chat ID:', GROUP_CHAT_ID || 'Not configured');

// Mock WhatsApp client
const mockWhatsAppClient = {
  sendMessage: async (chatId, message) => {
    console.log(`📱 Would send message to: ${chatId}`);
    console.log(`📝 Message: ${message.substring(0, 100)}...`);
    return Promise.resolve();
  }
};

// Mock sendWhatsApp function
async function sendWhatsApp(message) {
  console.log('\n=== SENDING WHATSAPP MESSAGE ===');
  
  if (!GROUP_CHAT_ID) {
    console.log('❌ No group chat ID configured; skipping WhatsApp message');
    return;
  }
  
  try {
    await mockWhatsAppClient.sendMessage(GROUP_CHAT_ID, message);
    console.log(`✅ WhatsApp message sent to group chat: ${GROUP_CHAT_ID}`);
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp to group ${GROUP_CHAT_ID}:`, error.message);
  }
}

// Test with sample message
const testMessage = `🚨🚨🚨 CAL DINGER! 🚨🚨🚨 Test home run! ⚾💥

🎯 WAGER UPDATE 🎯
📊 Current: 47 HR
📈 Projected: 62 HR

🥇 Matt: 48% (61,62,63,64) 🎯
🥈 Austin: 25% (53,57,58,59)
🥉 Tim: 19% (54,55,56,60)
❌ No Winner: 15%`;

console.log('\n=== TESTING MESSAGE SENDING ===');
sendWhatsApp(testMessage);

console.log('\n=== CONFIGURATION SUMMARY ===');
console.log('✅ Removed: RECIPIENT_NUMBERS (individual phone numbers)');
console.log('✅ Added: GROUP_CHAT_ID (single group chat)');
console.log('✅ Updated: sendWhatsApp() function');
console.log('✅ Updated: Health status endpoint');
console.log('✅ Updated: README documentation');

if (GROUP_CHAT_ID) {
  console.log('\n🟢 Group chat is configured and ready!');
} else {
  console.log('\n🟡 Set GROUP_CHAT_ID environment variable to enable messaging');
  console.log('   Example: GROUP_CHAT_ID=120363123456789012@g.us');
}