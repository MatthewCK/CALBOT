/* eslint-disable no-console */
require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');

// --- Config (env) ---
const PORT = process.env.PORT || 3000;
const RECIPIENT_NUMBERS = (process.env.RECIPIENT_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);

// Log configuration on startup
console.log('=== CAL DINGER BOT STARTUP ===');
console.log('Port:', PORT);
console.log('Recipient Numbers:', RECIPIENT_NUMBERS);
console.log('Number of recipients:', RECIPIENT_NUMBERS.length);
console.log('Cal Raleigh Player ID:', CAL_RALEIGH_PLAYER_ID);
console.log('Mariners Team ID:', MARINERS_TEAM_ID);
console.log('Current Season:', CURRENT_SEASON);
console.log('Poll Interval (ms):', POLL_INTERVAL_MS);
console.log('================================');

// Real MLB IDs
const CAL_RALEIGH_PLAYER_ID = process.env.CAL_RALEIGH_PLAYER_ID || '668939';
const MARINERS_TEAM_ID = process.env.MARINERS_TEAM_ID || '136';
const CURRENT_SEASON = new Date().getFullYear();

// Polling interval in ms
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 15000);

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

// WhatsApp event handlers
whatsappClient.on('qr', (qr) => {
  try {
    currentQRCode = qr;
    console.log('=== WHATSAPP QR CODE ===');
    console.log('QR Code Data (copy this to a QR code generator if needed):');
    console.log(qr);
    console.log('--- End QR Code Data ---');
    
    // Try to generate a more compatible QR code
    try {
      console.log('Alternative QR Code (if terminal supports it):');
      qrcode.generate(qr, { small: true });
    } catch (error) {
      console.log('Terminal QR code generation failed, using data only');
    }
    
    console.log('=== END WHATSAPP QR CODE ===');
  } catch (error) {
    console.error('Error handling QR code:', error.message);
  }
});

whatsappClient.on('ready', () => {
  try {
    console.log('WhatsApp client is ready!');
    whatsappReady = true;
    checkAndSendInitialConfirmation();
  } catch (error) {
    console.error('Error in WhatsApp ready handler:', error.message);
  }
});

whatsappClient.on('auth_failure', (msg) => {
  console.error('WhatsApp authentication failed:', msg);
});

// WhatsApp will be initialized after server starts

async function checkAndSendInitialConfirmation() {
  if (initialConfirmationSent) return;
  
  try {
    // Test MLB API by fetching Cal's stats
    console.log('Testing MLB API for initial confirmation...');
    const calStats = await fetchCalSeasonStats();
    
    if (whatsappReady && calStats) {
      const message = `🚨🚨🚨 CAL DINGER BOT IS READY! 🚨🚨🚨\n\n⚾ WhatsApp: ✅ Connected\n📊 MLB API: ✅ Responding\n🏟️ Cal's ${CURRENT_SEASON} Stats:\n   • HR: ${calStats.homeRuns}\n   • RBI: ${calStats.rbi}\n   • AVG: ${calStats.avg}\n   • OPS: ${calStats.ops}\n\n🔍 Monitoring for Cal dingers... ⚾💥`;
      
      await sendWhatsApp(message);
      initialConfirmationSent = true;
      console.log('Initial confirmation message sent!');
    }
  } catch (error) {
    console.log('MLB API not ready yet, will retry on next poll cycle');
  }
}

function getTodayDateString() {
  const now = new Date();
  // Use current year for MLB season
  const y = now.getFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchJson(url) {
  const res = await fetch(url);
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
  console.log('Fetching schedule from:', url);
  
  try {
    const data = await fetchJson(url);
    console.log('Schedule response:', JSON.stringify(data, null, 2));
    
    const dates = data?.dates || [];
    for (const day of dates) {
      for (const game of (day?.games || [])) {
        // Return the first gamePk; could enhance for doubleheaders later
        console.log('Found game:', game.gamePk, game.status?.detailedState);
        return game.gamePk;
      }
    }
    console.log('No games found for date:', date);
    return null;
  } catch (error) {
    console.error('Error fetching schedule:', error.message);
    return null;
  }
}

async function fetchLiveFeed(gamePk) {
  if (!gamePk) {
    throw new Error('gamePk is required to fetch live feed');
  }
  const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
  console.log('Fetching live feed from:', url);
  return fetchJson(url);
}

async function fetchCalSeasonStats() {
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${CAL_RALEIGH_PLAYER_ID}/stats?stats=season&season=${CURRENT_SEASON}&group=hitting`;
    console.log('Fetching Cal\'s season stats from:', url);
    const data = await fetchJson(url);
    
    const stats = data?.stats?.[0]?.splits?.[0]?.stat;
    if (stats) {
      return {
        homeRuns: stats.homeRuns || 0,
        rbi: stats.rbi || 0,
        avg: stats.avg || 0,
        ops: stats.ops || 0
      };
    }
    return { homeRuns: 0, rbi: 0, avg: 0, ops: 0 };
  } catch (error) {
    console.error('Error fetching Cal\'s season stats:', error.message);
    return { homeRuns: 0, rbi: 0, avg: 0, ops: 0 };
  }
}

async function sendWhatsApp(message) {
  if (!whatsappReady) {
    console.log('WhatsApp not ready; skipping message:', message);
    return;
  }
  if (RECIPIENT_NUMBERS.length === 0) {
    console.log('No recipients configured; skipping WhatsApp message');
    return;
  }
  
  for (const number of RECIPIENT_NUMBERS) {
    try {
      // Format number for WhatsApp (remove + and add country code if needed)
      const formattedNumber = number.replace('+', '');
      const chatId = `${formattedNumber}@c.us`;
      
      await whatsappClient.sendMessage(chatId, message);
      console.log(`WhatsApp message sent to ${number}`);
    } catch (error) {
      console.error(`Failed to send WhatsApp to ${number}:`, error.message);
    }
  }
}

function formatHrMessage(play, seasonStats = null) {
  const inningHalf = play?.about?.isTopInning ? 'Top' : 'Bottom';
  const inning = play?.about?.inning;
  const distance = play?.hitData?.totalDistance || play?.hitData?.totalDistance?.toString?.();
  const exitVelo = play?.hitData?.launchSpeed;
  const launchAngle = play?.hitData?.launchAngle;
  const rbis = play?.result?.rbi;
  const desc = play?.result?.description || 'Home run!';
  
  // Calculate new season total (current HR + this HR)
  const currentSeasonHRs = seasonStats?.homeRuns || 0;
  const newSeasonTotal = currentSeasonHRs + 1;
  
  const bits = [
    `🚨🚨🚨 CAL DINGER! 🚨🚨🚨 ${desc} ⚾💥`,
    inning ? `${inningHalf} ${inning} ⚾` : undefined,
    rbis != null ? `${rbis} RBI 🏃‍♂️` : undefined,
    exitVelo ? `EV ${exitVelo} mph 💨` : undefined,
    launchAngle ? `LA ${launchAngle}° 📐` : undefined,
    distance ? `${distance} ft 🚀` : undefined,
    `Season HR #${newSeasonTotal} 🏆`,
  ].filter(Boolean);
  return bits.join(' • ');
}

async function checkForCalDingers(gamePk) {
  if (!gamePk) {
    console.log('No gamePk provided, skipping Cal dinger check');
    return;
  }
  
  try {
    const feed = await fetchLiveFeed(gamePk);
    const allPlays = feed?.liveData?.plays?.allPlays || [];
    console.log(`Checking ${allPlays.length} plays for Cal dingers...`);

    for (const play of allPlays) {
      if (!isHomeRunPlay(play)) continue;
      if (!batterIsCal(play)) continue;
      const eventId = play?.playEvents?.[0]?.details?.eventId || play?.playGuid || `${play?.about?.atBatIndex}`;
      if (eventId && notifiedEventIds.has(eventId)) continue;

      const seasonStats = await fetchCalSeasonStats();
      console.log('Cal\'s current season stats:', seasonStats);
      const msg = formatHrMessage(play, seasonStats);
      console.log('Detected HR by Cal Raleigh:', msg);
      await sendWhatsApp(msg);
      if (eventId) notifiedEventIds.add(eventId);
    }
  } catch (error) {
    console.error('Error checking for Cal dingers:', error.message);
  }
}

let currentGamePk = null;
let pollTimer = null;

async function pollLoop() {
  try {
    // Check for initial confirmation if not sent yet
    if (!initialConfirmationSent && whatsappReady) {
      await checkAndSendInitialConfirmation();
    }
    
    if (!currentGamePk) {
      console.log('No current gamePk, searching for today\'s Mariners game...');
      currentGamePk = await findTodayMarinersGamePk();
      if (!currentGamePk) {
        console.log('No Mariners game found today; will retry in next poll cycle');
        return;
      }
      console.log('Found and now tracking gamePk:', currentGamePk);
    }
    
    console.log('Polling for Cal dingers in gamePk:', currentGamePk);
    await checkForCalDingers(currentGamePk);
  } catch (err) {
    console.error('Poll loop error:', err?.message || err);
    // Reset currentGamePk on error to retry finding a game
    currentGamePk = null;
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollLoop, POLL_INTERVAL_MS);
  // Kick off immediately
  pollLoop();
}

// Minimal server for Railway health check and manual trigger
const app = express();
app.get('/', (req, res) => {
  res.json({ 
    ok: true, 
    service: 'cal-dinger-bot', 
    trackingGamePk: currentGamePk || null,
    whatsappReady: whatsappReady,
    hasQRCode: !!currentQRCode,
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
    console.log('Testing schedule URL:', scheduleUrl);
    
    // Test with today's actual date first
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    console.log('Today\'s date:', todayString);
    
    let scheduleData;
    try {
      scheduleData = await fetchJson(scheduleUrl);
    } catch (error) {
      console.log('Failed with calculated date, trying today\'s actual date...');
      const todayUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${todayString}&teamId=${MARINERS_TEAM_ID}&sportId=1`;
      console.log('Trying today URL:', todayUrl);
      scheduleData = await fetchJson(todayUrl);
    }
    
    // Test 2: If there's a game, get the live feed
    let liveFeedData = null;
    let gamePk = null;
    
    if (scheduleData?.dates && scheduleData.dates.length > 0) {
      const games = scheduleData.dates[0]?.games || [];
      if (games.length > 0) {
        gamePk = games[0].gamePk;
        console.log('Found gamePk:', gamePk);
        
        const liveFeedUrl = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
        console.log('Testing live feed URL:', liveFeedUrl);
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
    console.error('MLB API test error:', e);
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
    console.error('Cal stats error:', e);
    res.status(500).json({ 
      ok: false, 
      error: e?.message || String(e)
    });
  }
});

app.get('/whatsapp-qr', (req, res) => {
  console.log('WhatsApp QR endpoint accessed');
  console.log('Current QR code available:', !!currentQRCode);
  console.log('WhatsApp ready:', whatsappReady);
  
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

// Start the server immediately, then initialize WhatsApp
app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
  console.log('Express server is ready - health checks should pass now');
  
  // Initialize WhatsApp after server is ready
  setTimeout(() => {
    console.log('Starting WhatsApp initialization...');
    whatsappClient.initialize();
  }, 2000);
  
  // Start polling after a delay to ensure everything is ready
  setTimeout(() => {
    console.log('Starting polling loop...');
    startPolling();
  }, 5000);
});


