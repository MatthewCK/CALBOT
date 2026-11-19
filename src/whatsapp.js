// WhatsApp delivery. If the connection drops, the process exits and Railway restarts it;
// the saved login in <dataDir>/.wwebjs_auth/ lets it reconnect without a new QR scan.
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');

const MAX_PENDING = 20;
const CONNECTION_CHECK_MS = 5 * 60_000;

let client = null;
const state = { ready: false, qr: null };
const pending = []; // messages sent before WhatsApp finished connecting
let targets = [];

function exitForRestart(reason) {
  console.error(`${reason} - exiting so Railway restarts the service`);
  process.exit(1);
}

async function deliver(text) {
  if (!targets.length) {
    console.log(`(no chats configured) Would send:\n${text}`);
    return;
  }
  for (const chatId of targets) {
    try {
      await client.sendMessage(chatId, text);
    } catch (err) {
      console.error(`WhatsApp send to ${chatId} failed:`, err.message);
    }
  }
}

async function send(text) {
  if (!state.ready) {
    if (pending.push(text) > MAX_PENDING) pending.shift();
    return;
  }
  await deliver(text);
}

async function checkConnection() {
  if (!state.ready) return;
  const timeout = new Promise(resolve => setTimeout(() => resolve('NO RESPONSE'), 30_000));
  const status = await Promise.race([client.getState(), timeout]).catch(err => err.message);
  if (status !== 'CONNECTED') exitForRestart(`WhatsApp state is ${status}`);
}

function start({ dataDir, groupChatId, recipientNumbers, onReady }) {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(dataDir, '.wwebjs_auth') }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });
  targets = [
    ...recipientNumbers.map(n => `${n.replace(/^\+/, '')}@c.us`),
    ...(groupChatId ? [groupChatId] : []),
  ];
  if (!targets.length) console.warn('No GROUP_CHAT_ID or RECIPIENT_NUMBERS set; messages will only be logged');

  client.on('qr', qr => {
    state.qr = qr;
    console.log('WhatsApp needs linking: open /qr and scan it from WhatsApp > Linked Devices');
  });
  client.on('ready', async () => {
    state.ready = true;
    state.qr = null;
    console.log('WhatsApp ready');
    while (pending.length) await deliver(pending.shift());
    onReady();
  });
  client.on('auth_failure', msg => console.error('WhatsApp auth failure:', msg));
  client.on('disconnected', reason => exitForRestart(`WhatsApp disconnected (${reason})`));

  // Helps with setup: log group IDs so GROUP_CHAT_ID can be copied from the logs.
  if (!groupChatId) {
    client.on('message_create', m => {
      const chatId = m.fromMe ? m.to : m.from;
      if (chatId.endsWith('@g.us')) console.log(`Message in group chat ${chatId}`);
    });
  }

  client.initialize().catch(err => exitForRestart(`WhatsApp failed to start: ${err.message}`));
  setInterval(checkConnection, CONNECTION_CHECK_MS);
}

module.exports = { start, send, state, targetCount: () => targets.length };
