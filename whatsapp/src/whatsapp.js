// WhatsApp delivery. If the connection drops, the process exits and Railway restarts it;
// the saved login in <dataDir>/.wwebjs_auth/ lets it reconnect without a new QR scan.
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const config = require('./config');

const MAX_PENDING = 20;
const CONNECTION_CHECK_MS = 5 * 60_000;
const STATUS_COOLDOWN_MS = 10_000; // per chat, so a burst of status commands gets one reply

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

function start({ onStatusRequest }) {
  const { dataDir, groupChatId, recipientNumbers } = config;
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
  });
  client.on('auth_failure', msg => console.error('WhatsApp auth failure:', msg));
  client.on('disconnected', reason => exitForRestart(`WhatsApp disconnected (${reason})`));

  // message_create fires for everyone's messages, including ones sent from this account's phone.
  const lastStatusReply = {};
  client.on('message_create', async m => {
    const chatId = m.fromMe ? m.to : m.from;
    // Helps with setup: log group IDs so GROUP_CHAT_ID can be copied from the logs.
    if (!groupChatId && chatId.endsWith('@g.us')) console.log(`Message in group chat ${chatId}`);

    // Anyone in a configured chat can send the status command (default !cal) to check the bot is up.
    if (m.body?.trim().toLowerCase() !== config.command || !targets.includes(chatId)) return;
    if (Date.now() - (lastStatusReply[chatId] || 0) < STATUS_COOLDOWN_MS) return;
    lastStatusReply[chatId] = Date.now();
    console.log(`${config.command} received in ${chatId}`);
    try {
      await client.sendMessage(chatId, await onStatusRequest());
    } catch (err) {
      console.error(`${config.command} reply failed:`, err.message);
    }
  });

  client.initialize().catch(err => exitForRestart(`WhatsApp failed to start: ${err.message}`));
  setInterval(checkConnection, CONNECTION_CHECK_MS);
}

module.exports = { start, send, state, targetCount: () => targets.length };
