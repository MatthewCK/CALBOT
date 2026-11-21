// All settings come from environment variables (a .env file locally). See .env.example.
// server.js loads .env before this file is required; tests set variables directly.

const list = value => (value || '').split(',').map(s => s.trim()).filter(Boolean);

// "Tim:54,55,56,60;Austin:53,57,58,59" -> { Tim: [54, 55, 56, 60], Austin: [53, 57, 58, 59] }
function parseWagerPicks(value) {
  const picks = {};
  for (const entry of (value || '').split(';')) {
    const [name, numbers] = entry.split(':');
    const values = list(numbers).map(Number).filter(Number.isInteger);
    if (name?.trim() && values.length) picks[name.trim()] = values;
  }
  return picks;
}

const timeZone = process.env.TIMEZONE || 'America/Los_Angeles';
new Intl.DateTimeFormat('en-US', { timeZone }); // throws a clear error if TIMEZONE is invalid

module.exports = {
  // Who to follow
  playerId: Number(process.env.PLAYER_ID || 663728),   // Cal Raleigh
  playerName: process.env.PLAYER_NAME || 'Cal',
  teamId: Number(process.env.TEAM_ID || 136),          // Seattle Mariners
  timeZone,

  // Where to send alerts
  groupChatId: process.env.GROUP_CHAT_ID || '',
  recipientNumbers: list(process.env.RECIPIENT_NUMBERS),

  // Chat command that replies with the bot's status
  command: (process.env.COMMAND || '!cal').trim().toLowerCase(),

  // Optional season home run wager; left out of messages when empty
  wagerPicks: parseWagerPicks(process.env.WAGER_PICKS),

  // Running the service
  port: Number(process.env.PORT || 3000),
  pollMs: Number(process.env.POLL_INTERVAL_MS || 15_000),
  dataDir: process.env.DATA_DIR || '.',

  parseWagerPicks,
};
