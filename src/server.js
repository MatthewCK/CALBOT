/* eslint-disable no-console */
require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');

// --- Config (env) ---
const PORT = process.env.PORT || 3000;
const RECIPIENT_NUMBERS = (process.env.RECIPIENT_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID || ''; // WhatsApp group chat ID

// Real MLB IDs
const CAL_RALEIGH_PLAYER_ID = process.env.CAL_RALEIGH_PLAYER_ID || '663728';
const MARINERS_TEAM_ID = process.env.MARINERS_TEAM_ID || '136';
const CURRENT_SEASON = new Date().getFullYear();

// Polling interval in ms
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 15000);

// Enhanced plate appearance notifications flag
const ENHANCED_PA = process.env.ENHANCED_PA === 'true' || process.env.ENHANCED_PA === '1';

// Startup silently flag - if true, skip initial confirmation message
const STARTUP_SILENTLY = process.env.STARTUP_SILENTLY === 'true' || process.env.STARTUP_SILENTLY === '1';

// Home run wager data
const WAGER_DATA = {
  Tim: [54, 55, 56, 60],
  Austin: [53, 57, 58, 59], 
  Matt: [61, 62, 63, 64]
};

// Log configuration on startup
console.log(`[${getTimestamp()}] === CAL DINGER BOT STARTUP ===`);
console.log(`[${getTimestamp()}] Port:`, PORT);
console.log(`[${getTimestamp()}] Recipient Numbers:`, RECIPIENT_NUMBERS.length > 0 ? RECIPIENT_NUMBERS : 'Not configured');
console.log(`[${getTimestamp()}] Group Chat ID:`, GROUP_CHAT_ID || 'Not configured');
console.log(`[${getTimestamp()}] Cal Raleigh Player ID:`, CAL_RALEIGH_PLAYER_ID);
console.log(`[${getTimestamp()}] Mariners Team ID:`, MARINERS_TEAM_ID);
console.log(`[${getTimestamp()}] Current Season:`, CURRENT_SEASON);
console.log(`[${getTimestamp()}] Poll Interval (ms):`, POLL_INTERVAL_MS);
console.log(`[${getTimestamp()}] Enhanced PA Notifications:`, ENHANCED_PA ? 'Enabled' : 'Disabled (home runs only)');
console.log(`[${getTimestamp()}] Startup Silently:`, STARTUP_SILENTLY ? 'Enabled (no startup message)' : 'Disabled (startup message will be sent)');
console.log(`[${getTimestamp()}] ================================`);

// Initialize WhatsApp client
const whatsappClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let whatsappReady = false;
let initialConfirmationSent = false;
let currentQRCode = null;
let gameStartNotificationSent = false;
let currentGameInfo = null;
let calIsUpToBat = false;
let nextPollTime = null;

// WhatsApp reliability variables
const AUTH_TIMEOUT = process.env.WHATSAPP_AUTH_TIMEOUT || 90000; // 90 seconds
const MAX_AUTH_RETRIES = process.env.WHATSAPP_MAX_RETRIES || 3;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_DELAY = 5000; // 5 seconds
const MAX_DELAY = 300000; // 5 minutes
const RESET_ATTEMPTS_AFTER = 3600000; // 1 hour
const HEALTH_CHECK_INTERVAL = process.env.WHATSAPP_HEALTH_CHECK_INTERVAL || 300000; // 5 minutes
const MAX_SILENCE_DURATION = process.env.WHATSAPP_MAX_SILENCE || 1800000; // 30 minutes
const PING_TIMEOUT = 30000; // 30 seconds
const MAX_QUEUE_SIZE = 100;

let authTimeout = null;
let authRetries = 0;
let lastQRTime = null;
let reconnectAttempts = 0;
let lastReconnectTime = 0;
let reconnectTimer = null;
let isRestarting = false;
let lastHealthCheck = Date.now();
let healthCheckTimer = null;
let lastActivityTime = Date.now();
const messageQueue = [];

// Data cache to reduce redundant API calls
const cache = {
  calStats: { data: null, timestamp: 0, ttl: 60000 }, // 1 minute
  liveFeed: { data: null, gamePk: null, timestamp: 0, ttl: 10000 }, // 10 seconds
  dateString: { data: null, timestamp: 0, ttl: 3600000 } // 1 hour
};

// Helper function to get timestamp for logging
function getTimestamp() {
  return new Date().toISOString();
}

// Helper function for consistent notification handling
async function sendNotificationIfEnabled(message, notificationType) {
  const shouldSend = ENHANCED_PA || notificationType === 'dinger' || notificationType === 'initialization';
  
  if (shouldSend) {
    await sendWhatsApp(message);
    console.log(`[${getTimestamp()}] ${notificationType} notification sent`);
  } else {
    console.log(`[${getTimestamp()}] ${notificationType} notification skipped (ENHANCED_PA disabled)`);
  }
}

// Cached date string function
function getTodayDateString() {
  const now = Date.now();
  if (!cache.dateString.data || (now - cache.dateString.timestamp) > cache.dateString.ttl) {
    const pacificTime = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
    const y = pacificTime.getFullYear();
    const m = String(pacificTime.getMonth() + 1).padStart(2, '0');
    const d = String(pacificTime.getDate()).padStart(2, '0');
    cache.dateString.data = `${y}-${m}-${d}`;
    cache.dateString.timestamp = now;
  }
  return cache.dateString.data;
}

// Cached Cal stats function
async function fetchCalSeasonStats() {
  const now = Date.now();
  if (cache.calStats.data && (now - cache.calStats.timestamp) < cache.calStats.ttl) {
    return cache.calStats.data;
  }

  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${CAL_RALEIGH_PLAYER_ID}/stats?stats=season&season=${CURRENT_SEASON}&sportId=1`;
    const response = await fetchJson(url);
    
    if (!response?.stats?.[0]?.splits?.[0]?.stat) {
      throw new Error('No season stats found');
    }
    
    const stats = response.stats[0].splits[0].stat;
    const result = {
      homeRuns: stats.homeRuns || 0,
      rbi: stats.rbi || 0,
      avg: stats.avg || '.000',
      ops: stats.ops || '.000',
      gamesPlayed: stats.gamesPlayed || 0
    };
    
    cache.calStats.data = result;
    cache.calStats.timestamp = now;
    return result;
  } catch (error) {
    console.error(`[${getTimestamp()}] Error fetching Cal season stats:`, error.message);
    return cache.calStats.data; // Return cached data if available
  }
}

// Cached live feed function
async function fetchLiveFeed(gamePk) {
  const now = Date.now();
  if (cache.liveFeed.data && 
      cache.liveFeed.gamePk === gamePk && 
      (now - cache.liveFeed.timestamp) < cache.liveFeed.ttl) {
    return cache.liveFeed.data;
  }

  try {
    const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
    const response = await fetchJson(url);
    
    cache.liveFeed.data = response;
    cache.liveFeed.gamePk = gamePk;
    cache.liveFeed.timestamp = now;
    return response;
  } catch (error) {
    if (error.message.includes('404')) {
      console.log(`[${getTimestamp()}] Live feed not available (game likely finished or not started)`);
      // Clear game tracking if it's a 404 - game is probably finished
      return null;
    }
    console.error(`[${getTimestamp()}] Error fetching live feed:`, error.message);
    return cache.liveFeed.data; // Return cached data if available
  }
}

// WhatsApp event handlers
whatsappClient.on('qr', (qr) => {
  try {
    currentQRCode = qr;
    lastQRTime = Date.now();
    authRetries++;
    
    console.log(`[${getTimestamp()}] === WHATSAPP QR CODE (Attempt ${authRetries}) ===`);
    console.log(`[${getTimestamp()}] QR Code Data (copy this to a QR code generator if needed):`);
    console.log(`[${getTimestamp()}]`, qr);
    console.log(`[${getTimestamp()}] --- End QR Code Data ---`);
    
    // Try to generate a more compatible QR code
    try {
      console.log(`[${getTimestamp()}] Alternative QR Code (if terminal supports it):`);
      qrcode.generate(qr, { small: true });
    } catch (error) {
      console.log(`[${getTimestamp()}] Terminal QR code generation failed, using data only`);
    }
    
    console.log(`[${getTimestamp()}] === END WHATSAPP QR CODE ===`);
    
    // Clear any existing timeout
    if (authTimeout) clearTimeout(authTimeout);
    
    // Set timeout for authentication
    authTimeout = setTimeout(() => {
      console.warn(`[${getTimestamp()}] Authentication timeout after ${AUTH_TIMEOUT/1000}s - attempt ${authRetries}`);
      handleAuthTimeout();
    }, AUTH_TIMEOUT);
    
    logWhatsAppEvent('QR_GENERATED', { attempt: authRetries });
  } catch (error) {
    console.error(`[${getTimestamp()}] Error handling QR code:`, error.message);
  }
});

whatsappClient.on('ready', async () => {
  try {
    lastActivityTime = Date.now();
    whatsappReady = true;
    reconnectAttempts = 0; // Reset on successful connection
    authRetries = 0; // Reset auth retries on success
    
    // Clear auth timeout
    if (authTimeout) {
      clearTimeout(authTimeout);
      authTimeout = null;
    }
    
    console.log(`[${getTimestamp()}] WhatsApp client is ready!`);
    logWhatsAppEvent('READY');
    startHealthChecks();
    
    // Process any queued messages
    setTimeout(async () => {
      await processMessageQueue();
      checkAndSendInitialConfirmation();
    }, 1000);
  } catch (error) {
    console.error(`[${getTimestamp()}] Error in WhatsApp ready handler:`, error.message);
  }
});

whatsappClient.on('auth_failure', async (msg) => {
  console.error(`[${getTimestamp()}] WhatsApp authentication failed:`, msg);
  whatsappReady = false;
  logWhatsAppEvent('AUTH_FAILURE', { message: msg });
  await clearCorruptedSession();
  await restartWhatsAppClient();
});

whatsappClient.on('disconnected', (reason) => {
  console.warn(`[${getTimestamp()}] WhatsApp disconnected:`, reason);
  whatsappReady = false;
  logWhatsAppEvent('DISCONNECTED', { reason });
  
  // Reset attempts counter if it's been a while since last attempt
  if (Date.now() - lastReconnectTime > RESET_ATTEMPTS_AFTER) {
    reconnectAttempts = 0;
  }
  
  attemptReconnect();
});

// WhatsApp will be initialized after server starts

async function checkAndSendInitialConfirmation() {
  if (initialConfirmationSent) {
    console.log(`[${getTimestamp()}] Initial confirmation already sent, skipping...`);
    return;
  }
  
  // Skip initial confirmation if STARTUP_SILENTLY is enabled
  if (STARTUP_SILENTLY) {
    console.log(`[${getTimestamp()}] STARTUP_SILENTLY enabled - skipping initial confirmation message`);
    initialConfirmationSent = true;
    return;
  }
  
  try {
    // Test MLB API by fetching Cal's stats
    console.log(`[${getTimestamp()}] Testing MLB API for initial confirmation...`);
    const calStats = await fetchCalSeasonStats();
    
    if (whatsappReady && calStats) {
      const message = `🚨🚨🚨 CAL DINGER BOT IS READY! 🚨🚨🚨\n\n⚾ WhatsApp: ✅ Connected\n📊 MLB API: ✅ Responding\n🏟️ Cal's ${CURRENT_SEASON} Stats:\n   • HR: ${calStats.homeRuns}\n   • RBI: ${calStats.rbi}\n   • AVG: ${calStats.avg}\n   • OPS: ${calStats.ops}\n\n🔍 Monitoring for Cal dingers... ⚾💥${formatWagerSection(calStats.homeRuns, calStats)}`;
      
      await sendNotificationIfEnabled(message, 'initialization');
      initialConfirmationSent = true;
    } else {
      console.log(`[${getTimestamp()}] Not ready for initial confirmation yet:`, {
        whatsappReady,
        hasCalStats: !!calStats
      });
    }
  } catch (error) {
    console.log(`[${getTimestamp()}] MLB API not ready yet, will retry on next poll cycle:`, error.message);
  }
}

async function checkAndSendGameStartNotification(gamePk) {
  if (gameStartNotificationSent) {
    console.log(`[${getTimestamp()}] Game start notification already sent, skipping...`);
    return;
  }
  
  try {
    console.log(`[${getTimestamp()}] Checking for game start notification...`);
    
    // Get game details
    const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${getTodayDateString()}&teamId=${MARINERS_TEAM_ID}&sportId=1`;
    const scheduleData = await fetchJson(scheduleUrl);
    
    let gameInfo = null;
    if (scheduleData?.dates && scheduleData.dates.length > 0) {
      const games = scheduleData.dates[0]?.games || [];
      gameInfo = games.find(game => game.gamePk === gamePk);
    }
    
    if (gameInfo && gameInfo.status?.detailedState === 'In Progress') {
      // Get Cal's current stats
      const calStats = await fetchCalSeasonStats();
      
      // Format game info
      const awayTeam = gameInfo.teams?.away?.team?.name || 'Away Team';
      const homeTeam = gameInfo.teams?.home?.team?.name || 'Home Team';
      const venue = gameInfo.venue?.name || 'Unknown Venue';
      const gameTime = new Date(gameInfo.gameDate).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        timeZone: 'America/Los_Angeles'
      });
      
      const message = `⚾🚨 MARINERS GAME STARTED! 🚨⚾\n\n🏟️ ${awayTeam} @ ${homeTeam}\n📍 ${venue}\n🕐 ${gameTime} PT\n\n🏆 Cal's ${CURRENT_SEASON} Stats:\n   • HR: ${calStats.homeRuns}\n   • RBI: ${calStats.rbi}\n   • AVG: ${calStats.avg}\n   • OPS: ${calStats.ops}\n\n🔍 Monitoring for Cal dingers... ⚾💥${formatWagerSection(calStats.homeRuns, calStats)}`;
      
      await sendNotificationIfEnabled(message, 'gamestart');
      gameStartNotificationSent = true;
    } else {
      console.log(`[${getTimestamp()}] Game not in progress yet:`, gameInfo?.status?.detailedState);
    }
  } catch (error) {
    console.error(`[${getTimestamp()}] Error checking for game start notification:`, error.message);
  }
}

// Polling intervals in milliseconds
const POLL_INTERVALS = {
  CAL_BATTING: 30 * 1000,     // 30 seconds when Cal is up
  GAME_ACTIVE: 60 * 1000,     // 60 seconds during game
  GAME_PREGAME: 10 * 1000,    // 10 seconds before game starts
  GAME_DISTANT: null          // Calculate based on game time
};

function shouldPollNow() {
  return !nextPollTime || new Date() >= nextPollTime;
}

function setNextPollTime() {
  const now = Date.now();
  
  if (calIsUpToBat) {
    nextPollTime = new Date(now + POLL_INTERVALS.CAL_BATTING);
    console.log(`[${getTimestamp()}] Cal is up to bat - switching to 30-second polling`);
    scheduleWatchdogCheck();
    return;
  }
  
  if (!currentGameInfo) {
    console.log(`[${getTimestamp()}] No game info available`);
    return;
  }
  
  const gameStatus = currentGameInfo.status?.detailedState;
  
  if (gameStatus === 'In Progress') {
    nextPollTime = new Date(now + POLL_INTERVALS.GAME_ACTIVE);
    console.log(`[${getTimestamp()}] Game in progress - polling every 60 seconds`);
    scheduleWatchdogCheck();
    return;
  }
  
  // Check if game is finished - if so, we need to search for next game
  if (gameStatus === 'Final' || gameStatus === 'Game Over' || gameStatus === 'Completed Early') {
    console.log(`[${getTimestamp()}] Game finished (${gameStatus}) - will search for next game`);
    // Don't set a poll time here - let the main loop reset and find next game
    return;
  }
  
  // Handle pre-game timing
  const gameTime = new Date(currentGameInfo.gameDate);
  const fiveMinutesBeforeGame = gameTime.getTime() - (5 * 60 * 1000);
  
  if (now < fiveMinutesBeforeGame) {
    // Wait until 5 minutes before game
    nextPollTime = new Date(fiveMinutesBeforeGame);
    const minutesUntil = Math.round((fiveMinutesBeforeGame - now) / 60000);
    console.log(`[${getTimestamp()}] Waiting ${minutesUntil} minutes until 5min before game`);
    scheduleWatchdogCheck();
  } else {
    // Within 5 minutes of game start - poll every 10 seconds
    nextPollTime = new Date(now + POLL_INTERVALS.GAME_PREGAME);
    console.log(`[${getTimestamp()}] Pre-game polling - every 10 seconds`);
    scheduleWatchdogCheck();
  }
}

async function checkIfCalIsUpToBat(gamePk) {
  try {
    const feed = await fetchLiveFeed(gamePk);
    const liveData = feed?.liveData;
    
    if (!liveData) return false;
    
    // Check if Cal is the current batter
    const currentBatter = liveData?.plays?.currentPlay?.matchup?.batter;
    if (currentBatter && String(currentBatter.id) === String(CAL_RALEIGH_PLAYER_ID)) {
      if (!calIsUpToBat) {
        console.log(`[${getTimestamp()}] 🚨 CAL IS UP TO BAT! 🚨`);
        calIsUpToBat = true;
        setNextPollTime();
        
        // Send notification that Cal is up to bat
        const message = `⚾🚨 CAL IS UP TO BAT! 🚨⚾\n\n🏟️ ${getGameInfoString()}\n\n🔍 Monitoring for dinger... ⚾💥`;
        await sendNotificationIfEnabled(message, 'upbat');
      }
      return true;
    }
    
    // Check if Cal just finished his at-bat
    if (calIsUpToBat) {
      console.log(`[${getTimestamp()}] Cal finished his at-bat, switching back to 60-second polling`);
      calIsUpToBat = false;
      setNextPollTime();
      
      // Send notification with at-bat result
      if (ENHANCED_PA) {
        await sendCalAtBatResult(gamePk);
      }
    }
    
    return false;
  } catch (error) {
    console.error(`[${getTimestamp()}] Error checking if Cal is up to bat:`, error.message);
    return false;
  }
}

function getGameInfoString() {
  if (!currentGameInfo) return 'Mariners Game';
  
  const awayTeam = currentGameInfo.teams?.away?.team?.name || 'Away Team';
  const homeTeam = currentGameInfo.teams?.home?.team?.name || 'Home Team';
  const inning = currentGameInfo.linescore?.currentInning || 'Unknown';
  const inningHalf = currentGameInfo.linescore?.inningState || '';
  
  return `${awayTeam} @ ${homeTeam} - ${inningHalf} ${inning}`;
}

async function sendCalAtBatResult(gamePk) {
  try {
    const feed = await fetchLiveFeed(gamePk);
    const allPlays = feed?.liveData?.plays?.allPlays || [];
    
    // Find Cal's most recent at-bat
    const calPlays = allPlays.filter(play => {
      const batterId = String(play?.matchup?.batter?.id || '');
      return batterId === String(CAL_RALEIGH_PLAYER_ID);
    });
    
    if (calPlays.length === 0) return;
    
    const lastCalPlay = calPlays[calPlays.length - 1];
    const result = lastCalPlay?.result;
    const about = lastCalPlay?.about;
    
    if (!result) return;
    
    // Check if this is a home run - if so, skip the at-bat result since we already sent the dinger message
    const eventType = result.eventType || '';
    if (eventType === 'home_run') {
      console.log(`[${getTimestamp()}] Skipping at-bat result for home run - dinger message already sent`);
      return;
    }
    
    // Format the at-bat result
    const description = result.description || 'Unknown result';
    const rbi = result.rbi || 0;
    const runs = result.runs || 0;
    
    let resultEmoji = '⚾';
    let resultType = 'At-Bat';
    
    if (eventType === 'single' || eventType === 'double' || eventType === 'triple') {
      resultEmoji = '🏃‍♂️';
      resultType = 'Hit';
    } else if (eventType === 'walk') {
      resultEmoji = '🚶‍♂️';
      resultType = 'Walk';
    } else if (eventType === 'strikeout') {
      resultEmoji = '❌';
      resultType = 'Strikeout';
    } else if (eventType === 'out') {
      resultEmoji = '🔄';
      resultType = 'Out';
    }
    
    const inningHalf = about?.isTopInning ? 'Top' : 'Bottom';
    const inning = about?.inning || 'Unknown';
    
    const message = `${resultEmoji} CAL'S AT-BAT RESULT: ${resultType} ${resultEmoji}\n\n🏟️ ${getGameInfoString()}\n📝 ${description}\n${rbi > 0 ? `🏃‍♂️ ${rbi} RBI\n` : ''}${runs > 0 ? `🏃‍♂️ ${runs} Run(s)\n` : ''}⚾ Inning: ${inningHalf} ${inning}`;
    
    await sendNotificationIfEnabled(message, 'atbat');
    
  } catch (error) {
    console.error(`[${getTimestamp()}] Error sending Cal at-bat result:`, error.message);
  }
}


// Fetch wrapper with timeout to prevent hanging requests
async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Cal-Dinger-Bot/1.0'
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Fetch timeout after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  }
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// In-memory set of eventIds notified to avoid duplicates while process is running
const notifiedEventIds = new Set();

// Basic HR detection from StatsAPI live feed
function isHomeRunPlay(play) {
  // Conservative: check result.eventType and description
  const result = play?.result;
  if (!result) return false;
  const type = result.eventType || '';
  const desc = (result.description || '').toLowerCase();
  if (type === 'home_run') return true;
  if (desc.includes('homers') || desc.includes('home run')) return true;
  return false;
}

function batterIsCal(play) {
  const batterId = String(play?.matchup?.batter?.id || '');
  return batterId && batterId === String(CAL_RALEIGH_PLAYER_ID);
}

async function findTodayMarinersGamePk() {
  const date = getTodayDateString();
  const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&teamId=${MARINERS_TEAM_ID}&sportId=1`;
  console.log(`[${getTimestamp()}] Fetching schedule from:`, url);
  
  try {
    const data = await fetchJson(url);
    console.log(`[${getTimestamp()}] Schedule response:`, JSON.stringify(data, null, 2));
    
    const dates = data?.dates || [];
    for (const day of dates) {
      for (const game of (day?.games || [])) {
        const status = game.status?.detailedState;
        console.log(`[${getTimestamp()}] Found game:`, game.gamePk, status);
        
        // Only return games that are not finished
        if (status !== 'Final' && status !== 'Game Over' && status !== 'Completed Early' && status !== 'Cancelled' && status !== 'Postponed') {
          console.log(`[${getTimestamp()}] Tracking active/scheduled game:`, game.gamePk);
          return game.gamePk;
        } else {
          console.log(`[${getTimestamp()}] Skipping finished game:`, game.gamePk, status);
        }
      }
    }
    console.log(`[${getTimestamp()}] No games found for date:`, date);
    return null;
  } catch (error) {
    console.error(`[${getTimestamp()}] Error fetching schedule:`, error.message);
    return null;
  }
}

async function findNextMarinersGame() {
  try {
    // Check next 7 days for upcoming games
    const today = getTodayDateString(); // Use same date logic as rest of app
    console.log(`[${getTimestamp()}] Today is:`, today);
    
    for (let i = 1; i <= 7; i++) {
      // Calculate next date using Pacific Time like the rest of the app
      const checkDate = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
      checkDate.setDate(checkDate.getDate() + i);
      
      const y = checkDate.getFullYear();
      const m = String(checkDate.getMonth() + 1).padStart(2, '0');
      const d = String(checkDate.getDate()).padStart(2, '0');
      const dateString = `${y}-${m}-${d}`;
      
      console.log(`[${getTimestamp()}] Checking for games on: ${dateString} (${i} days from today)`);
      
      const url = `https://statsapi.mlb.com/api/v1/schedule?date=${dateString}&teamId=${MARINERS_TEAM_ID}&sportId=1`;
      
      const data = await fetchJson(url);
      const dates = data?.dates || [];
      
      console.log(`[${getTimestamp()}] Schedule data for ${dateString}:`, JSON.stringify(data, null, 2));
      
      for (const day of dates) {
        for (const game of (day?.games || [])) {
          const status = game.status?.detailedState;
          console.log(`[${getTimestamp()}] Found game on ${dateString}: ${game.gamePk} - ${status}`);
          
          if (status !== 'Final' && status !== 'Completed Early' && status !== 'Cancelled' && status !== 'Postponed') {
            console.log(`[${getTimestamp()}] Next Mariners game found: ${dateString} at ${game.gameDate}`);
            return new Date(game.gameDate);
          }
        }
      }
    }
    console.log(`[${getTimestamp()}] No upcoming Mariners games found in next 7 days`);
    return null;
  } catch (error) {
    console.error(`[${getTimestamp()}] Error finding next Mariners game:`, error.message);
    return null;
  }
}

// WhatsApp reliability functions
function logWhatsAppEvent(event, data = {}) {
  console.log(`[${getTimestamp()}] WHATSAPP_${event.toUpperCase()}:`, JSON.stringify({
    event,
    timestamp: Date.now(),
    ready: whatsappReady,
    attempts: reconnectAttempts,
    ...data
  }));
}

async function handleAuthTimeout() {
  if (authRetries >= MAX_AUTH_RETRIES) {
    console.error(`[${getTimestamp()}] Max auth retries (${MAX_AUTH_RETRIES}) reached`);
    await clearCorruptedSession();
    authRetries = 0;
  }
  await restartWhatsAppClient();
}

async function clearCorruptedSession() {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const sessionPath = path.join(process.cwd(), '.wwebjs_auth');
    
    console.warn(`[${getTimestamp()}] Clearing corrupted session data`);
    await fs.rm(sessionPath, { recursive: true, force: true });
  } catch (error) {
    console.error(`[${getTimestamp()}] Error clearing session:`, error.message);
  }
}

async function restartWhatsAppClient() {
  if (isRestarting) {
    console.log(`[${getTimestamp()}] Client restart already in progress`);
    return;
  }
  
  isRestarting = true;
  whatsappReady = false;
  
  try {
    console.log(`[${getTimestamp()}] Restarting WhatsApp client...`);
    
    // Stop health checks
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
    
    // Destroy current client
    await whatsappClient.destroy();
    
    // Clear timeouts
    if (authTimeout) {
      clearTimeout(authTimeout);
      authTimeout = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
    // Wait before reinitializing
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Reinitialize
    whatsappClient.initialize();
    
  } catch (error) {
    console.error(`[${getTimestamp()}] Error restarting WhatsApp client:`, error.message);
  } finally {
    isRestarting = false;
  }
}

async function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`[${getTimestamp()}] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
    // Clear session and start fresh
    await clearCorruptedSession();
    reconnectAttempts = 0;
  }
  
  const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttempts), MAX_DELAY);
  reconnectAttempts++;
  lastReconnectTime = Date.now();
  
  console.log(`[${getTimestamp()}] Attempting reconnection ${reconnectAttempts} in ${delay/1000}s`);
  
  reconnectTimer = setTimeout(async () => {
    try {
      await restartWhatsAppClient();
    } catch (error) {
      console.error(`[${getTimestamp()}] Reconnection attempt ${reconnectAttempts} failed:`, error.message);
      attemptReconnect(); // Retry with longer delay
    }
  }, delay);
}

function startHealthChecks() {
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  
  healthCheckTimer = setInterval(async () => {
    await performHealthCheck();
  }, HEALTH_CHECK_INTERVAL);
}

async function performHealthCheck() {
  const now = Date.now();
  lastHealthCheck = now;
  
  if (!whatsappReady) {
    console.warn(`[${getTimestamp()}] Health check: WhatsApp not ready`);
    return;
  }
  
  // Check for prolonged silence
  if (now - lastActivityTime > MAX_SILENCE_DURATION) {
    console.warn(`[${getTimestamp()}] Health check: No activity for ${(now - lastActivityTime)/60000} minutes`);
    await performConnectionTest();
  }
}

async function performConnectionTest() {
  try {
    console.log(`[${getTimestamp()}] Performing connection test...`);
    
    // Test connection by checking client state
    const state = await Promise.race([
      whatsappClient.getState(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), PING_TIMEOUT))
    ]);
    
    if (state !== 'CONNECTED') {
      console.warn(`[${getTimestamp()}] Connection test failed - state: ${state}`);
      await restartWhatsAppClient();
    } else {
      lastActivityTime = Date.now();
      console.log(`[${getTimestamp()}] Connection test passed`);
    }
    
  } catch (error) {
    console.error(`[${getTimestamp()}] Connection test failed:`, error.message);
    await restartWhatsAppClient();
  }
}

async function processMessageQueue() {
  while (messageQueue.length > 0 && whatsappReady) {
    const queuedMessage = messageQueue.shift();
    
    try {
      await sendMessageDirect(queuedMessage.message);
      console.log(`[${getTimestamp()}] Sent queued message from ${new Date(queuedMessage.timestamp)}`);
    } catch (error) {
      console.error(`[${getTimestamp()}] Failed to send queued message:`, error.message);
      
      // Re-queue if not too old and hasn't failed too many times
      if (queuedMessage.attempts < 3 && Date.now() - queuedMessage.timestamp < 3600000) {
        queuedMessage.attempts++;
        messageQueue.unshift(queuedMessage);
      }
      break;
    }
  }
}

function getWhatsAppStatus() {
  const now = Date.now();
  return {
    ready: whatsappReady,
    lastQRTime: lastQRTime,
    lastActivityTime: lastActivityTime,
    reconnectAttempts: reconnectAttempts,
    authRetries: authRetries,
    timeSinceLastActivity: lastActivityTime ? now - lastActivityTime : null,
    isRestarting: isRestarting,
    queueSize: messageQueue.length,
    healthStatus: whatsappReady && (now - lastActivityTime < MAX_SILENCE_DURATION) ? 'healthy' : 'degraded'
  };
}

async function sendWhatsApp(message) {
  if (!whatsappReady) {
    console.log(`[${getTimestamp()}] WhatsApp not ready; queueing message`);
    
    if (messageQueue.length >= MAX_QUEUE_SIZE) {
      messageQueue.shift(); // Remove oldest message
    }
    
    messageQueue.push({
      message,
      timestamp: Date.now(),
      attempts: 0
    });
    return;
  }
  
  // Send queued messages first
  await processMessageQueue();
  
  // Send current message
  await sendMessageDirect(message);
}

async function sendMessageDirect(message) {
  if (!GROUP_CHAT_ID && RECIPIENT_NUMBERS.length === 0) {
    console.log(`[${getTimestamp()}] No group chat ID or recipient numbers configured; skipping WhatsApp message`);
    return;
  }
  
  let successCount = 0;
  let totalTargets = 0;
  
  // Send to individual recipient numbers if configured
  if (RECIPIENT_NUMBERS.length > 0) {
    totalTargets += RECIPIENT_NUMBERS.length;
    for (const number of RECIPIENT_NUMBERS) {
      try {
        // Format number for WhatsApp (remove + and add country code if needed)
        const formattedNumber = number.replace('+', '');
        const chatId = `${formattedNumber}@c.us`;
        
        await whatsappClient.sendMessage(chatId, message);
        console.log(`[${getTimestamp()}] WhatsApp message sent to ${number}`);
        successCount++;
        lastActivityTime = Date.now(); // Update activity time on successful send
      } catch (error) {
        console.error(`[${getTimestamp()}] Failed to send WhatsApp to ${number}:`, error.message);
      }
    }
  }
  
  // Send to group chat if configured
  if (GROUP_CHAT_ID) {
    totalTargets += 1;
    try {
      await whatsappClient.sendMessage(GROUP_CHAT_ID, message);
      console.log(`[${getTimestamp()}] WhatsApp message sent to group chat: ${GROUP_CHAT_ID}`);
      successCount++;
      lastActivityTime = Date.now(); // Update activity time on successful send
    } catch (error) {
      console.error(`[${getTimestamp()}] Failed to send WhatsApp to group ${GROUP_CHAT_ID}:`, error.message);
    }
  }
  
  console.log(`[${getTimestamp()}] WhatsApp delivery: ${successCount}/${totalTargets} successful`);
}

function calculateSeasonProjection(currentHRs, seasonStats = null) {
  // MLB regular season is 162 games
  const TOTAL_GAMES = 162;
  
  // Get games played from season stats, or estimate if not available
  let gamesPlayed;
  if (seasonStats && seasonStats.gamesPlayed) {
    gamesPlayed = seasonStats.gamesPlayed;
  } else {
    // Fallback: estimate based on current date if stats not available
    const now = new Date();
    const seasonStart = new Date(now.getFullYear(), 3, 1); // April 1st
    const seasonEnd = new Date(now.getFullYear(), 8, 30); // September 30th
    const dateProgress = Math.max(0, Math.min(1, (now - seasonStart) / (seasonEnd - seasonStart)));
    gamesPlayed = Math.round(dateProgress * TOTAL_GAMES);
  }
  
  const progressPercent = Math.max(0, Math.min(1, gamesPlayed / TOTAL_GAMES));
  
  if (progressPercent === 0 || gamesPlayed === 0) return currentHRs; // Season hasn't started
  
  // Project full season based on current pace
  return Math.round(currentHRs / progressPercent);
}

function calculateWagerProbabilities(currentHRs, projectedHRs, seasonStats = null) {
  // Use games played instead of dates for more accurate progress
  const TOTAL_GAMES = 162;
  
  let gamesPlayed;
  if (seasonStats && seasonStats.gamesPlayed) {
    gamesPlayed = seasonStats.gamesPlayed;
  } else {
    // Fallback: estimate based on current date if stats not available
    const now = new Date();
    const seasonStart = new Date(now.getFullYear(), 3, 1); // April 1st
    const seasonEnd = new Date(now.getFullYear(), 8, 30); // September 30th
    const dateProgress = Math.max(0, Math.min(1, (now - seasonStart) / (seasonEnd - seasonStart)));
    gamesPlayed = Math.round(dateProgress * TOTAL_GAMES);
  }
  
  const seasonProgress = Math.max(0, Math.min(1, gamesPlayed / TOTAL_GAMES));
  const remainingProgress = 1 - seasonProgress;
  
  // Standard deviation decreases as season progresses (more certainty)
  // Early season: high uncertainty (~8 HRs), late season: low uncertainty (~2 HRs)
  const baseStdDev = 2 + (remainingProgress * 6);
  
  // Get all possible winning numbers
  const allWinningNumbers = new Set();
  Object.values(WAGER_DATA).forEach(numbers => {
    numbers.forEach(num => allWinningNumbers.add(num));
  });
  
  // Calculate probabilities for a reasonable range of HR outcomes (e.g., ±15 from projection)
  const minHR = Math.max(0, Math.floor(projectedHRs - 15));
  const maxHR = Math.ceil(projectedHRs + 15);
  
  // Calculate probability for each possible HR total
  const hrProbabilities = {};
  let totalProbabilityMass = 0;
  
  for (let hr = minHR; hr <= maxHR; hr++) {
    const distance = Math.abs(hr - projectedHRs);
    const variance = baseStdDev * baseStdDev;
    const probability = (1 / Math.sqrt(2 * Math.PI * variance)) * Math.exp(-(distance * distance) / (2 * variance));
    hrProbabilities[hr] = probability;
    totalProbabilityMass += probability;
  }
  
  // Normalize HR probabilities
  for (let hr = minHR; hr <= maxHR; hr++) {
    hrProbabilities[hr] = hrProbabilities[hr] / totalProbabilityMass;
  }
  
  // Calculate probability for each person based on their picked numbers
  const results = {};
  
  for (const [person, numbers] of Object.entries(WAGER_DATA)) {
    let personProbability = 0;
    
    // Sum probabilities for all of this person's numbers
    for (const targetHR of numbers) {
      if (hrProbabilities[targetHR]) {
        personProbability += hrProbabilities[targetHR];
      }
    }
    
    results[person] = {
      numbers: WAGER_DATA[person],
      probability: personProbability,
      inRange: WAGER_DATA[person].some(num => Math.abs(num - projectedHRs) <= 2) // Within 2 HRs of projection
    };
  }
  
  // Calculate "no winner" probability (all HR values not picked by anyone)
  let noWinnerProbability = 0;
  const allPickedNumbers = new Set();
  Object.values(WAGER_DATA).forEach(numbers => {
    numbers.forEach(num => allPickedNumbers.add(num));
  });
  
  for (let hr = minHR; hr <= maxHR; hr++) {
    if (!allPickedNumbers.has(hr)) {
      noWinnerProbability += hrProbabilities[hr];
    }
  }
  
  results['No Winner'] = {
    numbers: ['Other'],
    probability: noWinnerProbability,
    inRange: false
  };
  
  return results;
}

function formatWagerSection(currentHRs, seasonStats = null) {
  const projectedHRs = calculateSeasonProjection(currentHRs, seasonStats);
  const probabilities = calculateWagerProbabilities(currentHRs, projectedHRs, seasonStats);
  
  let wagerText = `\n\n🎯 WAGER UPDATE\n`;
  wagerText += `Current: ${currentHRs} HR\n`;
  wagerText += `Linear Projection: ${projectedHRs} HR\n\n`;
  
  // Separate players from "No Winner" and sort by probability (highest first)
  const playerResults = Object.entries(probabilities)
    .filter(([person]) => person !== 'No Winner')
    .sort(([,a], [,b]) => b.probability - a.probability);
  
  const noWinnerResult = probabilities['No Winner'];
  
  playerResults.forEach(([person, data], index) => {
    const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
    const percent = data.probability * 100;
    const percentStr = percent < 1 && percent > 0 ? '<1' : percent.toFixed(0);
    const numbersStr = data.numbers.join(',');
    const indicator = data.inRange ? ' 🎯' : '';
    
    wagerText += `${emoji} ${person}: ${percentStr}%${indicator}\n`;
    wagerText += `   (${numbersStr})\n`;
  });
  
  // Add "No Winner" at the end
  if (noWinnerResult) {
    const percent = noWinnerResult.probability * 100;
    const percentStr = percent < 1 && percent > 0 ? '<1' : percent.toFixed(0);
    wagerText += `❌ No Winner: ${percentStr}%\n`;
  }
  
  return wagerText;
}

function formatHrMessage(play, seasonStats = null, gameFeed = null) {
  const inningHalf = play?.about?.isTopInning ? 'Top' : 'Bottom';
  const inning = play?.about?.inning;
  const distance = play?.hitData?.totalDistance || play?.hitData?.totalDistance?.toString?.();
  const exitVelo = play?.hitData?.launchSpeed;
  const launchAngle = play?.hitData?.launchAngle;
  const rbis = play?.result?.rbi;
  const desc = play?.result?.description || 'Home run!';
  
  const currentSeasonHRs = seasonStats?.homeRuns || 0;
  
  // Extract current game score and Cal's stats
  let gameInfoText = '';
  if (gameFeed?.liveData?.boxscore?.teams) {
    const boxscore = gameFeed.liveData.boxscore.teams;
    const awayTeam = boxscore.away;
    const homeTeam = boxscore.home;
    
    // Determine which team is Mariners and get score
    const marinersData = awayTeam?.team?.id === 136 ? awayTeam : homeTeam;
    const opponentData = awayTeam?.team?.id === 136 ? homeTeam : awayTeam;
    const marinersAway = awayTeam?.team?.id === 136;
    
    if (marinersData && opponentData) {
      const marinersScore = marinersData.teamStats?.batting?.runs || 0;
      const opponentScore = opponentData.teamStats?.batting?.runs || 0;
      const opponentName = opponentData.team?.abbreviation || 'OPP';
      
      // Format score for mobile
      if (marinersAway) {
        gameInfoText = `\n\n📊 SEA ${marinersScore} - ${opponentName} ${opponentScore}`;
      } else {
        gameInfoText = `\n\n📊 ${opponentName} ${opponentScore} - SEA ${marinersScore}`;
      }
      
      // Extract Cal's game stats
      if (marinersData?.players) {
        const calPlayerKey = Object.keys(marinersData.players).find(key => 
          marinersData.players[key].person.id === parseInt(CAL_RALEIGH_PLAYER_ID)
        );
        
        if (calPlayerKey) {
          const calGameStats = marinersData.players[calPlayerKey].stats?.batting;
          if (calGameStats) {
            const gameHits = calGameStats.hits || 0;
            const gameAB = calGameStats.atBats || 0;
            const gameRBI = calGameStats.rbi || 0;
            const gameRuns = calGameStats.runs || 0;
            
            gameInfoText += `\n🏟️ Cal: ${gameHits}/${gameAB}`;
            if (gameRBI > 0) gameInfoText += ` • ${gameRBI} RBI`;
            if (gameRuns > 0) gameInfoText += ` • ${gameRuns} R`;
          }
        }
      }
    }
  }
  
  // Format for mobile WhatsApp - use line breaks instead of bullets
  let mainMessage = `🚨🚨🚨 CAL DINGER! 🚨🚨🚨\n${desc} ⚾💥`;
  
  // Add home run details on separate lines
  if (inning) mainMessage += `\n${inningHalf} ${inning}`;
  if (rbis != null) mainMessage += ` • ${rbis} RBI 🏃‍♂️`;
  if (exitVelo) mainMessage += `\nEV ${exitVelo} mph`;
  if (launchAngle) mainMessage += ` • LA ${launchAngle}°`;
  if (distance) mainMessage += ` • ${distance} ft 🚀`;
  mainMessage += `\n\n🏆 Season HR #${currentSeasonHRs}`;
  const wagerSection = formatWagerSection(currentSeasonHRs, seasonStats);
  
  return mainMessage + gameInfoText + wagerSection;
}

async function checkForCalDingers(gamePk) {
  if (!gamePk) {
    console.log(`[${getTimestamp()}] No gamePk provided, skipping Cal dinger check`);
    return;
  }
  
  try {
    const feed = await fetchLiveFeed(gamePk);
    const allPlays = feed?.liveData?.plays?.allPlays || [];
    console.log(`[${getTimestamp()}] Checking ${allPlays.length} plays for Cal dingers...`);

    // Update currentGameInfo status from live feed for accurate polling intervals
    if (currentGameInfo && feed?.gameData?.status) {
      const oldStatus = currentGameInfo.status?.detailedState;
      const newStatus = feed.gameData.status.detailedState;
      
      if (oldStatus !== newStatus) {
        console.log(`[${getTimestamp()}] Game status updated: ${oldStatus} -> ${newStatus}`);
        currentGameInfo.status = feed.gameData.status;
      }
    }

    for (const play of allPlays) {
      if (!isHomeRunPlay(play)) continue;
      if (!batterIsCal(play)) continue;
      const eventId = play?.playEvents?.[0]?.details?.eventId || play?.playGuid || `${play?.about?.atBatIndex}`;
      if (eventId && notifiedEventIds.has(eventId)) continue;

      // Send the special dinger message for home runs
      const seasonStats = await fetchCalSeasonStats();
      console.log(`[${getTimestamp()}] Cal's current season stats:`, seasonStats);
      const msg = formatHrMessage(play, seasonStats, feed);
      console.log(`[${getTimestamp()}] Detected HR by Cal Raleigh:`, msg);
      await sendWhatsApp(msg);
      if (eventId) notifiedEventIds.add(eventId);
    }
  } catch (error) {
    console.error(`[${getTimestamp()}] Error checking for Cal dingers:`, error.message);
  }
}

let currentGamePk = null;
let pollTimer = null;
let lastPollTimestamp = Date.now();
let watchdogTimer = null;

// Global error handlers to prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${getTimestamp()}] Unhandled Rejection at:`, promise, 'reason:', reason);
  console.error(`[${getTimestamp()}] Stack trace:`, reason?.stack);
  // Don't exit process, just log the error
});

process.on('uncaughtException', (error) => {
  console.error(`[${getTimestamp()}] Uncaught Exception:`, error);
  console.error(`[${getTimestamp()}] Stack trace:`, error?.stack);
  // Don't exit process, just log the error
});

// Smart watchdog that checks every 30 minutes if polling missed its scheduled time
function scheduleWatchdogCheck() {
  // Clear any existing watchdog timer
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  
  // Always schedule watchdog every 30 minutes (1800000ms)
  const watchdogInterval = 30 * 60 * 1000; // 30 minutes
  
  console.log(`[${getTimestamp()}] WATCHDOG: Scheduled check in 30 minutes`);
  
  watchdogTimer = setTimeout(() => {
    const checkTime = Date.now();
    const timeSinceLastPoll = checkTime - lastPollTimestamp;
    
    // Check if polling has missed its scheduled time
    let pollingShouldHaveHappened = false;
    let missedByMinutes = 0;
    
    if (nextPollTime) {
      const timeSinceScheduledPoll = checkTime - nextPollTime.getTime();
      // Allow 2 minute buffer for scheduling delays
      const scheduleBuffer = 2 * 60 * 1000; // 2 minutes
      
      if (timeSinceScheduledPoll > scheduleBuffer) {
        pollingShouldHaveHappened = true;
        missedByMinutes = Math.round(timeSinceScheduledPoll / (60 * 1000));
      }
    }
    
    if (pollingShouldHaveHappened) {
      console.error(`[${getTimestamp()}] WATCHDOG: Polling missed its scheduled time! Should have polled ${missedByMinutes} minutes ago`);
      console.error(`[${getTimestamp()}] WATCHDOG: Last actual poll was ${Math.round(timeSinceLastPoll / (60 * 1000))} minutes ago`);
      console.log(`[${getTimestamp()}] WATCHDOG: Restarting polling system...`);
      
      // Reset polling state
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      nextPollTime = null;
      
      // Restart polling immediately
      setTimeout(() => {
        console.log(`[${getTimestamp()}] WATCHDOG: Initiating emergency restart of polling`);
        pollLoop();
      }, 1000);
    } else if (nextPollTime) {
      const nextPollInMinutes = Math.round((nextPollTime.getTime() - checkTime) / (60 * 1000));
      console.log(`[${getTimestamp()}] WATCHDOG: Polling healthy - next poll in ${nextPollInMinutes} minutes, last poll ${Math.round(timeSinceLastPoll / (60 * 1000))} minutes ago`);
    } else {
      // No nextPollTime set - this indicates a broken polling system that should restart immediately
      const lastPollMinutes = Math.round(timeSinceLastPoll / (60 * 1000));
      console.error(`[${getTimestamp()}] WATCHDOG: No nextPollTime set - polling system is broken! Last poll was ${lastPollMinutes} minutes ago`);
      console.log(`[${getTimestamp()}] WATCHDOG: Restarting polling system immediately...`);
      
      setTimeout(() => {
        console.log(`[${getTimestamp()}] WATCHDOG: Initiating restart due to missing nextPollTime`);
        pollLoop();
      }, 1000);
    }
    
    // Schedule the next watchdog check
    scheduleWatchdogCheck();
  }, watchdogInterval);
}

// Legacy function kept for compatibility - now just calls scheduleWatchdogCheck
function startWatchdog() {
  scheduleWatchdogCheck();
}

async function pollLoop() {
  try {
    // Update heartbeat
    lastPollTimestamp = Date.now();
    
    // Check if we should poll now
    if (!shouldPollNow()) {
      return;
    }
    
    // Check for initial confirmation if not sent yet
    if (!initialConfirmationSent && whatsappReady) {
      await checkAndSendInitialConfirmation();
    }
    
    
    if (!currentGamePk) {
      console.log(`[${getTimestamp()}] No current gamePk, searching for today's Mariners game...`);
      currentGamePk = await findTodayMarinersGamePk();
      if (!currentGamePk) {
        console.log(`[${getTimestamp()}] No active Mariners game found today`);
        // Check if there's a future game to wait for
        const nextGameTime = await findNextMarinersGame();
        if (nextGameTime) {
          const timeUntilGame = nextGameTime.getTime() - Date.now();
          const hoursUntil = Math.round(timeUntilGame / (1000 * 60 * 60));
          console.log(`[${getTimestamp()}] Next Mariners game in ${hoursUntil} hours. Checking again in 4 hours.`);
          nextPollTime = new Date(Date.now() + (4 * 60 * 60 * 1000)); // Check every 4 hours
          scheduleWatchdogCheck();
        } else {
          console.log(`[${getTimestamp()}] No upcoming Mariners games found; will retry in 30 minutes`);
          nextPollTime = new Date(Date.now() + (30 * 60 * 1000));
          scheduleWatchdogCheck();
        }
        return;
      }
      console.log(`[${getTimestamp()}] Found and now tracking gamePk:`, currentGamePk);
      
      // Reset notification flags for new game
      gameStartNotificationSent = false;
      
      // Get game info for polling calculations
      const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${getTodayDateString()}&teamId=${MARINERS_TEAM_ID}&sportId=1`;
      const scheduleData = await fetchJson(scheduleUrl);
      if (scheduleData?.dates && scheduleData.dates.length > 0) {
        const games = scheduleData.dates[0]?.games || [];
        currentGameInfo = games.find(game => game.gamePk === currentGamePk);
      }
    }
    
    // Check for game start notification
    if (currentGamePk && !gameStartNotificationSent) {
      await checkAndSendGameStartNotification(currentGamePk);
    }
    
    // Check if Cal is up to bat (only during games)
    if (currentGamePk && currentGameInfo?.status?.detailedState === 'In Progress') {
      await checkIfCalIsUpToBat(currentGamePk);
    }
    
    // Check if game is finished BEFORE polling to prevent infinite loops
    if (currentGameInfo?.status?.detailedState && 
        (currentGameInfo.status.detailedState === 'Final' || 
         currentGameInfo.status.detailedState === 'Game Over' || 
         currentGameInfo.status.detailedState === 'Completed Early')) {
      console.log(`[${getTimestamp()}] Game finished (${currentGameInfo.status.detailedState}) - resetting game tracking`);
      currentGamePk = null;
      currentGameInfo = null;
      calIsUpToBat = false;
      gameStartNotificationSent = false; // Reset for next game
      // Set next poll time to search for next game in 5 seconds
      nextPollTime = new Date(Date.now() + 5000);
      scheduleWatchdogCheck();
      scheduleNextPoll();
      return; // Exit early to prevent polling finished game
    }

    console.log(`[${getTimestamp()}] Polling for Cal dingers in gamePk:`, currentGamePk);
    await checkForCalDingers(currentGamePk);
    
    // Heartbeat log every 5 minutes during active polling
    const now = Date.now();
    if (!pollLoop.lastHeartbeat || (now - pollLoop.lastHeartbeat) > 5 * 60 * 1000) {
      console.log(`[${getTimestamp()}] 💓 HEARTBEAT: Bot is alive and polling (Game: ${currentGamePk || 'none'}, Status: ${currentGameInfo?.status?.detailedState || 'unknown'})`);
      pollLoop.lastHeartbeat = now;
    }
    
    // Set next poll time based on current game state
    setNextPollTime();
    
    // Schedule next poll based on nextPollTime
    scheduleNextPoll();
    
  } catch (err) {
    console.error(`[${getTimestamp()}] Poll loop error:`, err?.message || err);
    // Reset currentGamePk on error to retry finding a game
    currentGamePk = null;
    currentGameInfo = null;
    calIsUpToBat = false;
    // Schedule retry in 30 seconds on error
    scheduleNextPoll(30000);
  }
}

function scheduleNextPoll(overrideDelay = null) {
  // Clear existing timer
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  
  let delay;
  if (overrideDelay !== null) {
    delay = overrideDelay;
  } else if (nextPollTime) {
    delay = Math.max(0, nextPollTime.getTime() - Date.now());
  } else {
    delay = 5000; // Default 5 seconds if no nextPollTime set
  }
  
  console.log(`[${getTimestamp()}] Next poll scheduled in ${Math.round(delay / 1000)} seconds`);
  pollTimer = setTimeout(pollLoop, delay);
}

function startPolling() {
  if (pollTimer) return;
  console.log(`[${getTimestamp()}] Starting dynamic polling system...`);
  // Start the watchdog timer
  startWatchdog();
  // Kick off immediately
  pollLoop();
}

// Minimal server for Railway health check and manual trigger
const app = express();
app.get('/', (req, res) => {
  const whatsappStatus = getWhatsAppStatus();
  
  res.json({ 
    ok: true, 
    service: 'cal-dinger-bot', 
    uptime: process.uptime(),
    trackingGamePk: currentGamePk || null,
    whatsapp: {
      ...whatsappStatus,
      hasQRCode: !!currentQRCode
    },
    game: calStats ? {
      gameStatus: calStats.gameStatus,
      currentHR: calStats.currentHR,
      isPolling: isPolling
    } : null,
    timestamp: new Date().toISOString()
  });
});
app.post('/test-whatsapp', express.json(), async (req, res) => {
  const msg = req.body?.message || '🚨🚨🚨 TEST DINGER! 🚨🚨🚨 This is a test from Cal Dinger Bot! ⚾💥🏟️';
  try {
    await sendWhatsApp(msg);
    res.json({ ok: true, message: 'WhatsApp test message sent!' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/test-mlb-api', async (req, res) => {
  try {
    // Test 1: Get today's Mariners schedule
    const date = getTodayDateString();
    const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&teamId=${MARINERS_TEAM_ID}&sportId=1`;
    console.log(`[${getTimestamp()}] Testing schedule URL:`, scheduleUrl);
    
    // Test with today's actual date first
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    console.log(`[${getTimestamp()}] Today's date:`, todayString);
    
    let scheduleData;
    try {
      scheduleData = await fetchJson(scheduleUrl);
    } catch (error) {
      console.log(`[${getTimestamp()}] Failed with calculated date, trying today's actual date...`);
      const todayUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${todayString}&teamId=${MARINERS_TEAM_ID}&sportId=1`;
      console.log(`[${getTimestamp()}] Trying today URL:`, todayUrl);
      scheduleData = await fetchJson(todayUrl);
    }
    
    // Test 2: If there's a game, get the live feed
    let liveFeedData = null;
    let gamePk = null;
    
    if (scheduleData?.dates && scheduleData.dates.length > 0) {
      const games = scheduleData.dates[0]?.games || [];
      if (games.length > 0) {
        gamePk = games[0].gamePk;
        console.log(`[${getTimestamp()}] Found gamePk:`, gamePk);
        
        const liveFeedUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
        console.log(`[${getTimestamp()}] Testing live feed URL:`, liveFeedUrl);
        liveFeedData = await fetchJson(liveFeedUrl);
      }
    }
    
    // Test 3: Get Cal's season stats
    const calStats = await fetchCalSeasonStats();
    
    res.json({
      ok: true,
      date: date,
      scheduleData: scheduleData,
      gamePk: gamePk,
      liveFeedData: liveFeedData,
      calSeasonStats: calStats,
      message: 'MLB API test completed!'
    });
  } catch (e) {
    console.error(`[${getTimestamp()}] MLB API test error:`, e);
    res.status(500).json({ 
      ok: false, 
      error: e?.message || String(e),
      date: getTodayDateString(),
      marinersTeamId: MARINERS_TEAM_ID
    });
  }
});

app.get('/cal-stats', async (req, res) => {
  try {
    const stats = await fetchCalSeasonStats();
    res.json({
      ok: true,
      player: 'Cal Raleigh',
      playerId: CAL_RALEIGH_PLAYER_ID,
      season: CURRENT_SEASON,
      stats: stats
    });
  } catch (e) {
    console.error(`[${getTimestamp()}] Cal stats error:`, e);
    res.status(500).json({ 
      ok: false, 
      error: e?.message || String(e)
    });
  }
});

app.get('/whatsapp-qr', (req, res) => {
  console.log(`[${getTimestamp()}] WhatsApp QR endpoint accessed`);
  console.log(`[${getTimestamp()}] Current QR code available:`, !!currentQRCode);
  console.log(`[${getTimestamp()}] WhatsApp ready:`, whatsappReady);
  
  if (!currentQRCode) {
    return res.json({
      ok: false,
      message: 'No QR code available. WhatsApp may already be authenticated or not ready yet.',
      whatsappReady: whatsappReady,
      timestamp: new Date().toISOString()
    });
  }
  
  res.json({
    ok: true,
    qrCode: currentQRCode,
    whatsappReady: whatsappReady,
    message: 'Copy this QR code data to any QR code generator to scan with WhatsApp',
    timestamp: new Date().toISOString()
  });
});

app.post('/health-status', express.json(), async (req, res) => {
  try {
    console.log(`[${getTimestamp()}] Health status endpoint accessed`);
    
    // Get current status information
    const now = new Date();
    const calStats = await fetchCalSeasonStats();
    
    // Build health status message
    const statusMessage = `🏥 CAL DINGER BOT HEALTH STATUS 🏥\n\n` +
      `⏰ Time: ${now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT\n` +
      `📱 WhatsApp: ${whatsappReady ? '✅ Connected' : '❌ Disconnected'}\n` +
      `🎮 Game Tracking: ${currentGamePk ? `✅ Game ${currentGamePk}` : '❌ No game'}\n` +
      `🏟️ Game Status: ${currentGameInfo?.status?.detailedState || 'Unknown'}\n` +
      `⚾ Cal Up to Bat: ${calIsUpToBat ? '🚨 YES!' : 'No'}\n\n` +
      `🏆 Cal's ${CURRENT_SEASON} Stats:\n` +
      `   • HR: ${calStats.homeRuns}\n` +
      `   • RBI: ${calStats.rbi}\n` +
      `   • AVG: ${calStats.avg}\n` +
      `   • OPS: ${calStats.ops}\n\n` +
      `🔧 Bot Status: ✅ Healthy and Monitoring\n` +
      `📊 Recipients: ${RECIPIENT_NUMBERS.length} number(s) configured\n` +
      `📊 Group Chat: ${GROUP_CHAT_ID ? '✅ Configured' : '❌ Not configured'}`;
    
    // Send the health status message
    await sendWhatsApp(statusMessage);
    
    res.json({
      ok: true,
      message: 'Health status sent to WhatsApp recipients',
      timestamp: now.toISOString(),
      status: {
        whatsappReady,
        currentGamePk,
        gameStatus: currentGameInfo?.status?.detailedState,
        calIsUpToBat,
        recipientCount: RECIPIENT_NUMBERS.length,
        groupChatConfigured: !!GROUP_CHAT_ID
      }
    });
    
  } catch (error) {
    console.error(`[${getTimestamp()}] Error sending health status:`, error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start the server immediately, then initialize WhatsApp
app.listen(PORT, () => {
  console.log(`[${getTimestamp()}] Server listening on :${PORT}`);
  console.log(`[${getTimestamp()}] Express server is ready - health checks should pass now`);
  
  // Initialize WhatsApp after server is ready
  setTimeout(() => {
    console.log(`[${getTimestamp()}] Starting WhatsApp initialization...`);
    whatsappClient.initialize();
  }, 2000);
  
  // Start polling after a delay to ensure everything is ready
  setTimeout(() => {
    console.log(`[${getTimestamp()}] Starting polling loop...`);
    startPolling();
  }, 5000);
});


