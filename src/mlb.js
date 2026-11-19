// MLB Stats API access and live-feed helpers.
const API = 'https://statsapi.mlb.com/api';
const TRACKED_GAME_TYPES = new Set(['R', 'F', 'D', 'L', 'W']); // regular season + postseason rounds

async function getJson(path) {
  const res = await fetch(API + path, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`MLB API ${res.status} for ${path}`);
  return res.json();
}

// YYYY-MM-DD in Pacific time, offset by whole days.
function pacificDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

// True once a game won't produce any more plays today.
function isOver(status = {}) {
  return status.abstractGameState === 'Final' ||
    /Postponed|Cancelled|Suspended/.test(status.detailedState || '');
}

// Next regular-season or postseason game in the coming 10 days that isn't over.
async function findNextGame(teamId, skipGamePks) {
  const data = await getJson(
    `/v1/schedule?sportId=1&teamId=${teamId}&startDate=${pacificDate()}&endDate=${pacificDate(10)}`
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

module.exports = {
  findNextGame, getLiveFeed, getSeasonStats,
  isOver, homeRunsBy, playKey, hitData, boxscorePlayer,
};
