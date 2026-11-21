require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const config = require('./config');
const mlb = require('./mlb');
const messages = require('./messages');
const whatsapp = require('./whatsapp');

const { playerId: PLAYER_ID, teamId: TEAM_ID, playerName: NAME } = config;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const SENT_FILE = path.join(config.dataDir, '.calbot-sent.json'); // DATA_DIR on a volume survives redeploys
const ALREADY_SENT_AGE = 10 * MINUTE;  // on first look at a game, older HRs count as already sent

// --- State ---
const sentPlays = new Set(readSentFile());
const finishedGames = new Set();
let game = null; // the game being watched: { pk, seeded, playerAtBat, feed }
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
      console.log(`No games for team ${TEAM_ID} in the next 10 days`);
      return 6 * HOUR;
    }
    const wait = new Date(next.gameDate) - 5 * MINUTE - Date.now();
    if (wait > 0) {
      console.log(`Next game ${next.gamePk} starts ${next.gameDate}; checking again in ${Math.round(Math.min(wait, 6 * HOUR) / MINUTE)} min`);
      return Math.min(wait, 6 * HOUR);
    }
    game = { pk: next.gamePk, seeded: false, playerAtBat: null };
    console.log(`Watching game ${game.pk}: ${next.teams.away.team.name} @ ${next.teams.home.team.name}`);
  }

  const feed = await mlb.getLiveFeed(game.pk);
  game.feed = feed; // latest snapshot, used to answer the status command
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
    const text = messages.homeRun(play, feed, await seasonStats());
    console.log(`${NAME} home run in game ${game.pk}:\n${text}`);
    await whatsapp.send(text);
    markSent(key);
  }

  if (status.abstractGameState === 'Live') logAtBats(feed);

  if (mlb.isOver(status)) {
    if (status.abstractGameState === 'Final') finishedGames.add(game.pk);
    game = null;
    gameStatus = null;
    return MINUTE; // look for a doubleheader's second game
  }
  return config.pollMs;
}

// Diagnostics only (console, never WhatsApp): the player coming up to bat and how each at-bat ended.
function logAtBats(feed) {
  const { allPlays = [], currentPlay } = feed.liveData.plays;
  if (game.playerAtBat != null) {
    const finished = allPlays.find(p => p.about.atBatIndex === game.playerAtBat && p.about.isComplete);
    if (finished) {
      game.playerAtBat = null;
      console.log(`${NAME} at-bat result: ${finished.result.event} - ${finished.result.description}`);
    }
  }
  if (game.playerAtBat == null && currentPlay && !currentPlay.about.isComplete &&
      currentPlay.matchup?.batter?.id === PLAYER_ID) {
    game.playerAtBat = currentPlay.about.atBatIndex;
    console.log(`${NAME} up to bat: ${messages.situation(feed)}`);
  }
}

// Reply to the status command (COMMAND, default !cal): bot is up, plus game and player info.
async function statusReply() {
  const feed = game?.feed || null;
  const nextGame = feed ? null : await mlb.findNextGame(TEAM_ID, finishedGames).catch(() => null);
  return messages.status({ feed, nextGame, stats: await seasonStats() });
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
    sendingTo: whatsapp.targetCount(),
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

// --- Start ---
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => {
  console.error('Uncaught exception, exiting:', err);
  process.exit(1);
});

console.log(`CALBOT starting: ${NAME} (player ${PLAYER_ID}), team ${TEAM_ID}, poll ${config.pollMs / 1000}s, ` +
  `command ${config.command}, wager ${Object.keys(config.wagerPicks).join('/') || 'off'}`);
app.listen(config.port, () => console.log(`Listening on :${config.port}`));

whatsapp.start({ onStatusRequest: statusReply });

pollForever();
