require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const mlb = require('./mlb');
const messages = require('./messages');
const whatsapp = require('./whatsapp');

// --- Config ---
const PORT = process.env.PORT || 3000;
const PLAYER_ID = Number(process.env.CAL_RALEIGH_PLAYER_ID || 663728);
const TEAM_ID = Number(process.env.MARINERS_TEAM_ID || 136);
const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 15_000);
const ENHANCED_PA = ['true', '1'].includes(process.env.ENHANCED_PA);
const STARTUP_SILENTLY = ['true', '1'].includes(process.env.STARTUP_SILENTLY);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID || '';
const RECIPIENT_NUMBERS = (process.env.RECIPIENT_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DATA_DIR = process.env.DATA_DIR || '.'; // put on a Railway volume to survive redeploys
const SENT_FILE = path.join(DATA_DIR, '.calbot-sent.json');
const ALREADY_SENT_AGE = 10 * MINUTE;  // on first look at a game, older HRs count as already sent

// --- State ---
const sentPlays = new Set(readSentFile());
const finishedGames = new Set();
let game = null; // the game being watched: { pk, seeded, sawPreview, startAnnounced, calAtBat }
let gameStatus = null;

function readSentFile() {
  try { return JSON.parse(fs.readFileSync(SENT_FILE, 'utf8')); } catch { return []; }
}

function markSent(key) {
  sentPlays.add(key);
  fs.writeFile(SENT_FILE, JSON.stringify([...sentPlays]), err => err && console.error('Could not save sent plays:', err.message));
}

const seasonStats = () => mlb.getSeasonStats(PLAYER_ID, TEAM_ID).catch(err => {
  console.error('Could not fetch season stats:', err.message);
  return null;
});

// --- Polling ---

// One poll. Returns how long to wait before the next one.
async function poll() {
  if (!game) {
    const next = await mlb.findNextGame(TEAM_ID, finishedGames);
    if (!next) {
      console.log('No Mariners game in the next 10 days');
      return 6 * HOUR;
    }
    const wait = new Date(next.gameDate) - 5 * MINUTE - Date.now();
    if (wait > 0) {
      console.log(`Next game ${next.gamePk} starts ${next.gameDate}; checking again in ${Math.round(Math.min(wait, 6 * HOUR) / MINUTE)} min`);
      return Math.min(wait, 6 * HOUR);
    }
    game = { pk: next.gamePk, seeded: false, sawPreview: false, startAnnounced: false, calAtBat: null };
    console.log(`Watching game ${game.pk}: ${next.teams.away.team.name} @ ${next.teams.home.team.name}`);
  }

  const feed = await mlb.getLiveFeed(game.pk);
  const status = feed.gameData.status;
  if (status.detailedState !== gameStatus) console.log(`Game ${game.pk}: ${status.detailedState}`);
  gameStatus = status.detailedState;

  const homeRuns = mlb.homeRunsBy(feed, PLAYER_ID);
  if (!game.seeded) {
    // After a redeploy, don't re-announce home runs from earlier in the game.
    const cutoff = Date.now() - ALREADY_SENT_AGE;
    for (const play of homeRuns) {
      if (new Date(play.about.endTime) < cutoff) sentPlays.add(mlb.playKey(game.pk, play));
    }
    game.seeded = true;
  }

  for (const play of homeRuns) {
    const key = mlb.playKey(game.pk, play);
    if (sentPlays.has(key)) continue;
    const text = messages.homeRun(play, feed, await seasonStats(), PLAYER_ID);
    console.log(`Cal home run in game ${game.pk}:\n${text}`);
    await whatsapp.send(text);
    markSent(key);
  }

  if (ENHANCED_PA) await sendProgressUpdates(feed, status);

  if (mlb.isOver(status)) {
    if (status.abstractGameState === 'Final') finishedGames.add(game.pk);
    game = null;
    gameStatus = null;
    return MINUTE; // look for a doubleheader's second game
  }
  return POLL_MS;
}

// ENHANCED_PA messages: game start, Cal up to bat, and the result of each at-bat.
async function sendProgressUpdates(feed, status) {
  if (status.abstractGameState === 'Preview') {
    game.sawPreview = true;
    return;
  }
  // Only announce a start we actually saw, so a restart mid-game stays quiet.
  if (status.abstractGameState === 'Live' && game.sawPreview && !game.startAnnounced) {
    game.startAnnounced = true;
    await whatsapp.send(messages.gameStart(feed, await seasonStats()));
  }

  const { allPlays = [], currentPlay } = feed.liveData.plays;
  if (game.calAtBat != null) {
    const finished = allPlays.find(p => p.about.atBatIndex === game.calAtBat && p.about.isComplete);
    if (finished) {
      game.calAtBat = null;
      if (finished.result.eventType !== 'home_run') await whatsapp.send(messages.atBatResult(finished, feed));
    }
  }
  if (game.calAtBat == null && currentPlay && !currentPlay.about.isComplete &&
      currentPlay.matchup?.batter?.id === PLAYER_ID) {
    game.calAtBat = currentPlay.about.atBatIndex;
    await whatsapp.send(messages.upToBat(feed));
  }
}

async function pollForever() {
  for (;;) {
    let wait;
    try {
      wait = await poll();
    } catch (err) {
      console.error('Poll failed:', err.message);
      wait = 30_000;
    }
    await new Promise(resolve => setTimeout(resolve, wait));
  }
}

// --- HTTP ---
const app = express();

app.get('/', (req, res) => {
  res.json({
    ok: true,
    whatsappReady: whatsapp.state.ready,
    needsQrScan: Boolean(whatsapp.state.qr),
    watchingGame: game?.pk ?? null,
    gameStatus,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get('/qr', async (req, res) => {
  if (!whatsapp.state.qr) {
    return res.send(whatsapp.state.ready ? 'WhatsApp is already linked.' : 'No QR code yet. Refresh in a few seconds.');
  }
  const image = await QRCode.toDataURL(whatsapp.state.qr);
  res.send(`<meta http-equiv="refresh" content="15"><p>Scan from WhatsApp &gt; Linked Devices</p><img src="${image}">`);
});

// Endpoints that send messages need the x-admin-token header to match ADMIN_TOKEN.
function adminOnly(handler) {
  return async (req, res) => {
    if (!ADMIN_TOKEN || req.get('x-admin-token') !== ADMIN_TOKEN) {
      return res.status(401).json({ ok: false, error: ADMIN_TOKEN ? 'Missing or wrong x-admin-token header' : 'Set ADMIN_TOKEN to use this endpoint' });
    }
    try {
      await handler(req, res);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  };
}

app.post('/test-whatsapp', express.json(), adminOnly(async (req, res) => {
  await whatsapp.send(req.body?.message || '🚨🚨🚨 TEST DINGER! 🚨🚨🚨 This is a test from Cal Dinger Bot! ⚾💥🏟️');
  res.json({ ok: true });
}));

app.post('/health-status', adminOnly(async (req, res) => {
  await whatsapp.send(messages.healthStatus({
    whatsappReady: whatsapp.state.ready,
    gamePk: game?.pk,
    gameStatus,
    stats: await seasonStats(),
    targetCount: whatsapp.targetCount(),
  }));
  res.json({ ok: true });
}));

// --- Start ---
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => {
  console.error('Uncaught exception, exiting:', err);
  process.exit(1);
});

console.log(`CALBOT starting: player ${PLAYER_ID}, team ${TEAM_ID}, poll ${POLL_MS / 1000}s, enhanced ${ENHANCED_PA}`);
app.listen(PORT, () => console.log(`Listening on :${PORT}`));

whatsapp.start({
  dataDir: DATA_DIR,
  groupChatId: GROUP_CHAT_ID,
  recipientNumbers: RECIPIENT_NUMBERS,
  onReady: async () => {
    if (!STARTUP_SILENTLY) await whatsapp.send(messages.startup(await seasonStats()));
  },
});

pollForever();
