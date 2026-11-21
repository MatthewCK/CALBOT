// MLB Stats API access and live-feed helpers.
const { timeZone } = require('./config');

const API = 'https://statsapi.mlb.com/api';
const TRACKED_GAME_TYPES = new Set(['R', 'F', 'D', 'L', 'W']); // regular season + postseason rounds

async function getJson(path) {
  const res = await fetch(API + path, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`MLB API ${res.status} for ${path}`);
  return res.json();
}

// YYYY-MM-DD in TIMEZONE, offset by whole days.
function localDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone });
}

// True once a game won't produce any more plays today.
function isOver(status = {}) {
  return status.abstractGameState === 'Final' ||
    /Postponed|Cancelled|Suspended/.test(status.detailedState || '');
}

// Next regular-season or postseason game that isn't over. Starts from yesterday so a
// late game still running past midnight (in TIMEZONE) is found after a restart.
async function findNextGame(teamId, skipGamePks) {
  const data = await getJson(
    `/v1/schedule?sportId=1&teamId=${teamId}&startDate=${localDate(-1)}&endDate=${localDate(10)}`
  );
  const games = (data.dates || []).flatMap(d => d.games || []);
  return games.find(g =>
    TRACKED_GAME_TYPES.has(g.gameType) && !isOver(g.status) && !skipGamePks.has(g.gamePk)
  ) || null;
}

function getLiveFeed(gamePk) {
  return getJson(`/v1.1/game/${gamePk}/feed/live`);
}

// Player's regular-season line plus how many games the team has played.
async function getSeasonStats(playerId, teamId) {
  const season = new Date().getFullYear();
  const query = `stats?stats=season&group=hitting&season=${season}`;
  const [player, team] = await Promise.all([
    getJson(`/v1/people/${playerId}/${query}`),
    getJson(`/v1/teams/${teamId}/${query}`),
  ]);
  const p = player.stats?.[0]?.splits?.[0]?.stat || {};
  const t = team.stats?.[0]?.splits?.[0]?.stat || {};
  return {
    season,
    homeRuns: p.homeRuns ?? 0,
    rbi: p.rbi ?? 0,
    avg: p.avg ?? '.000',
    ops: p.ops ?? '.000',
    teamGames: t.gamesPlayed ?? p.gamesPlayed ?? 0,
  };
}

// --- Pure helpers over a live feed ---

function homeRunsBy(feed, playerId) {
  return (feed.liveData?.plays?.allPlays || []).filter(play =>
    play.result?.eventType === 'home_run' && play.matchup?.batter?.id === playerId
  );
}

// atBatIndex is only unique within a game, so the key includes the game.
function playKey(gamePk, play) {
  return `${gamePk}:${play.about.atBatIndex}`;
}

// Statcast data lives on the in-play pitch event, not on the play itself.
function hitData(play) {
  return (play.playEvents || []).findLast(e => e.hitData)?.hitData || {};
}

function boxscorePlayer(feed, playerId) {
  const teams = feed.liveData?.boxscore?.teams || {};
  return teams.away?.players?.[`ID${playerId}`] || teams.home?.players?.[`ID${playerId}`] || null;
}

// Where the player is relative to his team's next batter. Returns null if he isn't in the
// lineup (or it isn't posted yet). battersAhead 0 means he's due up now.
function lineupStatus(feed, playerId, teamId) {
  const teamIsAway = feed.gameData.teams.away.id === teamId;
  const players = feed.liveData?.boxscore?.teams?.[teamIsAway ? 'away' : 'home']?.players || {};
  // battingOrder is "300" for the 3rd spot, "301" for a sub in that spot.
  const spotOf = id => {
    const order = Number(players[`ID${id}`]?.battingOrder);
    return order ? Math.floor(order / 100) - 1 : null;
  };
  const playerSpot = spotOf(playerId);
  if (playerSpot == null) return null;

  // The team's most recent plate appearance tells us who's due.
  const last = (feed.liveData?.plays?.allPlays || []).findLast(p => p.about.isTopInning === teamIsAway);
  let dueSpot = 0;
  if (last) {
    const lastSpot = spotOf(last.matchup.batter.id);
    if (lastSpot == null) return null;
    dueSpot = last.about.isComplete ? (lastSpot + 1) % 9 : lastSpot;
  }

  const half = feed.liveData?.linescore?.inningState;
  return {
    spot: playerSpot + 1,
    battersAhead: (playerSpot - dueSpot + 9) % 9,
    teamBatting: half === (teamIsAway ? 'Top' : 'Bottom'),
  };
}

module.exports = {
  findNextGame, getLiveFeed, getSeasonStats,
  isOver, homeRunsBy, playKey, hitData, boxscorePlayer, lineupStatus,
};
