/* eslint-disable no-console */
require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');

// --- Config (env) ---
const PORT = process.env.PORT || 3000;
const RECIPIENT_NUMBERS = (process.env.RECIPIENT_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);

// Real MLB IDs
const CAL_RALEIGH_PLAYER_ID = process.env.CAL_RALEIGH_PLAYER_ID || '663728';
const MARINERS_TEAM_ID = process.env.MARINERS_TEAM_ID || '136';
const CURRENT_SEASON = new Date().getFullYear();

// Polling interval in ms
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 15000);

// Home run wager data
const WAGER_DATA = {
  Tim: [54, 55, 56, 60],
  Austin: [53, 57, 58, 59], 
  Matt: [61, 62, 63, 64]
};

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
let lastCheckedDate = null;
let currentGameInfo = null;
let calIsUpToBat = false;
let nextPollTime = null;

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
    // Add a small delay to prevent race conditions
    setTimeout(() => {
      checkAndSendInitialConfirmation();
    }, 1000);
  } catch (error) {
    console.error('Error in WhatsApp ready handler:', error.message);
  }
});

whatsappClient.on('auth_failure', (msg) => {
  console.error('WhatsApp authentication failed:', msg);
});

// WhatsApp will be initialized after server starts

async function checkAndSendInitialConfirmation() {
  if (initialConfirmationSent) {
    console.log('Initial confirmation already sent, skipping...');
    return;
  }
  
  try {
    // Test MLB API by fetching Cal's stats
    console.log('Testing MLB API for initial confirmation...');
    const calStats = await fetchCalSeasonStats();
    
    if (whatsappReady && calStats) {
      const message = `🚨🚨🚨 CAL DINGER BOT IS READY! 🚨🚨🚨\n\n⚾ WhatsApp: ✅ Connected\n📊 MLB API: ✅ Responding\n🏟️ Cal's ${CURRENT_SEASON} Stats:\n   • HR: ${calStats.homeRuns}\n   • RBI: ${calStats.rbi}\n   • AVG: ${calStats.avg}\n   • OPS: ${calStats.ops}\n\n🔍 Monitoring for Cal dingers... ⚾💥${formatWagerSection(calStats.homeRuns, calStats)}`;
      
      await sendWhatsApp(message);
      initialConfirmationSent = true;
      console.log('Initial confirmation message sent!');
    } else {
      console.log('Not ready for initial confirmation yet:', {
        whatsappReady,
        hasCalStats: !!calStats
      });
    }
  } catch (error) {
    console.log('MLB API not ready yet, will retry on next poll cycle:', error.message);
  }
}

async function checkAndSendGameStartNotification(gamePk) {
  if (gameStartNotificationSent) {
    console.log('Game start notification already sent, skipping...');
    return;
  }
  
  try {
    console.log('Checking for game start notification...');
    
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
      
      await sendWhatsApp(message);
      gameStartNotificationSent = true;
      console.log('Game start notification sent!');
    } else {
      console.log('Game not in progress yet:', gameInfo?.status?.detailedState);
    }
  } catch (error) {
    console.error('Error checking for game start notification:', error.message);
  }
}

function calculateNextPollTime(gameInfo) {
  if (!gameInfo) return null;
  
  const now = new Date();
  const gameTime = new Date(gameInfo.gameDate);
  const thirtyMinutesBeforeGame = new Date(gameTime.getTime() - (30 * 60 * 1000));
  
  // If we're more than 30 minutes before game, wait until 30 minutes before
  if (now < thirtyMinutesBeforeGame) {
    return thirtyMinutesBeforeGame;
  }
  
  // If game is in progress, poll every 10 seconds
  if (gameInfo.status?.detailedState === 'In Progress') {
    return new Date(now.getTime() + (10 * 1000));
  }
  
  // If game hasn't started yet, poll every 5 minutes
  return new Date(now.getTime() + (5 * 60 * 1000));
}

function shouldPollNow() {
  if (!nextPollTime) return true;
  return new Date() >= nextPollTime;
}

function updatePollInterval() {
  if (calIsUpToBat) {
    // Cal is up to bat - poll every second
    nextPollTime = new Date(Date.now() + 1000);
    console.log('Cal is up to bat - switching to 1-second polling');
  } else if (currentGameInfo && currentGameInfo.status?.detailedState === 'In Progress') {
    // Game in progress - poll every 10 seconds
    nextPollTime = new Date(Date.now() + (10 * 1000));
    console.log('Game in progress - polling every 10 seconds');
  } else if (currentGameInfo) {
    // Game scheduled - use calculated time
    nextPollTime = calculateNextPollTime(currentGameInfo);
    if (nextPollTime) {
      const timeUntilNextPoll = Math.round((nextPollTime - new Date()) / 1000 / 60);
      console.log(`Next poll in ${timeUntilNextPoll} minutes`);
    }
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
        console.log('🚨 CAL IS UP TO BAT! 🚨');
        calIsUpToBat = true;
        updatePollInterval();
        
        // Send notification that Cal is up to bat
        const message = `⚾🚨 CAL IS UP TO BAT! 🚨⚾\n\n🏟️ ${getGameInfoString()}\n\n🔍 Monitoring for dinger... ⚾💥`;
        await sendWhatsApp(message);
      }
      return true;
    }
    
    // Check if Cal just finished his at-bat
    if (calIsUpToBat) {
      console.log('Cal finished his at-bat, switching back to 10-second polling');
      calIsUpToBat = false;
      updatePollInterval();
      
      // Send notification with at-bat result
      await sendCalAtBatResult(gamePk);
    }
    
    return false;
  } catch (error) {
    console.error('Error checking if Cal is up to bat:', error.message);
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
      console.log('Skipping at-bat result for home run - dinger message already sent');
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
    
    await sendWhatsApp(message);
    console.log('Cal at-bat result notification sent:', description);
    
  } catch (error) {
    console.error('Error sending Cal at-bat result:', error.message);
  }
}

function getTodayDateString() {
  const now = new Date();
  // Use Pacific Time for MLB games (Mariners are in Seattle)
  const pacificTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
  const y = pacificTime.getFullYear();
  const m = String(pacificTime.getMonth() + 1).padStart(2, '0');
  const d = String(pacificTime.getDate()).padStart(2, '0');
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
        ops: stats.ops || 0,
        gamesPlayed: stats.gamesPlayed || 0
      };
    }
    return { homeRuns: 0, rbi: 0, avg: 0, ops: 0, gamesPlayed: 0 };
  } catch (error) {
    console.error('Error fetching Cal\'s season stats:', error.message);
    return { homeRuns: 0, rbi: 0, avg: 0, ops: 0, gamesPlayed: 0 };
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
  
  // Calculate probability for each possible HR total using normal distribution approximation
  const probabilities = {};
  let totalWinProbability = 0;
  
  for (const [person, numbers] of Object.entries(WAGER_DATA)) {
    let personProbability = 0;
    
    // Calculate probability Cal hits any of this person's numbers
    for (const targetHR of numbers) {
      // Simplified normal distribution probability
      // P(X = targetHR) ≈ probability density around that point
      const distance = Math.abs(targetHR - projectedHRs);
      const probability = Math.exp(-(distance * distance) / (2 * baseStdDev * baseStdDev));
      personProbability += probability;
    }
    
    probabilities[person] = personProbability;
    totalWinProbability += personProbability;
  }
  
  // Normalize probabilities and convert to percentages
  const normalizationFactor = Math.min(0.85, totalWinProbability); // Cap total win probability at 85%
  const results = {};
  
  for (const [person, rawProb] of Object.entries(probabilities)) {
    const normalizedProb = normalizationFactor > 0 ? (rawProb / totalWinProbability) * normalizationFactor : 0;
    
    results[person] = {
      numbers: WAGER_DATA[person],
      probability: Math.max(0.01, normalizedProb), // Minimum 1% chance
      inRange: WAGER_DATA[person].some(num => Math.abs(num - projectedHRs) <= 2) // Within 2 HRs of projection
    };
  }
  
  // Calculate "no winner" probability
  const totalAssignedProb = Object.values(results).reduce((sum, data) => sum + data.probability, 0);
  results['No Winner'] = {
    numbers: ['Other'],
    probability: Math.max(0.05, 1 - totalAssignedProb), // At least 5% chance no one wins
    inRange: false
  };
  
  return results;
}

function formatWagerSection(currentHRs, seasonStats = null) {
  const projectedHRs = calculateSeasonProjection(currentHRs, seasonStats);
  const probabilities = calculateWagerProbabilities(currentHRs, projectedHRs, seasonStats);
  
  let wagerText = `\n\n🎯 WAGER UPDATE 🎯\n`;
  wagerText += `📊 Current: ${currentHRs} HR\n`;
  wagerText += `📈 Linear Projection: ${projectedHRs} HR\n\n`;
  
  // Separate players from "No Winner" and sort by probability (highest first)
  const playerResults = Object.entries(probabilities)
    .filter(([person]) => person !== 'No Winner')
    .sort(([,a], [,b]) => b.probability - a.probability);
  
  const noWinnerResult = probabilities['No Winner'];
  
  playerResults.forEach(([person, data], index) => {
    const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
    const percentStr = (data.probability * 100).toFixed(0);
    const numbersStr = data.numbers.join(',');
    const indicator = data.inRange ? '🎯' : '';
    
    wagerText += `${emoji} ${person}: ${percentStr}% (${numbersStr}) ${indicator}\n`;
  });
  
  // Add "No Winner" at the end
  if (noWinnerResult) {
    const percentStr = (noWinnerResult.probability * 100).toFixed(0);
    wagerText += `❌ No Winner: ${percentStr}%\n`;
  }
  
  return wagerText;
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
  
  const mainMessage = bits.join(' • ');
  const wagerSection = formatWagerSection(newSeasonTotal, seasonStats);
  
  return mainMessage + wagerSection;
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

    // Update currentGameInfo status from live feed for accurate polling intervals
    if (currentGameInfo && feed?.gameData?.status) {
      const oldStatus = currentGameInfo.status?.detailedState;
      const newStatus = feed.gameData.status.detailedState;
      
      if (oldStatus !== newStatus) {
        console.log(`Game status updated: ${oldStatus} -> ${newStatus}`);
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
    // Check if we should poll now
    if (!shouldPollNow()) {
      return;
    }
    
    // Check for initial confirmation if not sent yet
    if (!initialConfirmationSent && whatsappReady) {
      await checkAndSendInitialConfirmation();
    }
    
    // Reset flags if it's a new day
    const today = getTodayDateString();
    if (lastCheckedDate && lastCheckedDate !== today) {
      console.log('New day detected, resetting notification flags');
      gameStartNotificationSent = false;
      currentGamePk = null;
      currentGameInfo = null;
      calIsUpToBat = false;
      nextPollTime = null;
    }
    lastCheckedDate = today;
    
    if (!currentGamePk) {
      console.log('No current gamePk, searching for today\'s Mariners game...');
      currentGamePk = await findTodayMarinersGamePk();
      if (!currentGamePk) {
        console.log('No Mariners game found today; will retry in next poll cycle');
        // Wait 30 minutes before checking again
        nextPollTime = new Date(Date.now() + (30 * 60 * 1000));
        return;
      }
      console.log('Found and now tracking gamePk:', currentGamePk);
      
      // Get game info for polling calculations
      const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${getTodayDateString()}&teamId=${MARINERS_TEAM_ID}&sportId=1`;
      const scheduleData = await fetchJson(scheduleUrl);
      if (scheduleData?.dates && scheduleData.dates.length > 0) {
        const games = scheduleData.dates[0]?.games || [];
        currentGameInfo = games.find(game => game.gamePk === currentGamePk);
        updatePollInterval();
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
    
    console.log('Polling for Cal dingers in gamePk:', currentGamePk);
    await checkForCalDingers(currentGamePk);
    
    // Update polling interval for next cycle
    updatePollInterval();
    
    // Schedule next poll based on nextPollTime
    scheduleNextPoll();
    
  } catch (err) {
    console.error('Poll loop error:', err?.message || err);
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
  
  console.log(`Next poll scheduled in ${Math.round(delay / 1000)} seconds`);
  pollTimer = setTimeout(pollLoop, delay);
}

function startPolling() {
  if (pollTimer) return;
  console.log('Starting dynamic polling system...');
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

app.post('/health-status', express.json(), async (req, res) => {
  try {
    console.log('Health status endpoint accessed');
    
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
      `📊 Recipients: ${RECIPIENT_NUMBERS.length} number(s) configured`;
    
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
        recipientCount: RECIPIENT_NUMBERS.length
      }
    });
    
  } catch (error) {
    console.error('Error sending health status:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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


