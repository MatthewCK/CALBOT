// WhatsApp message text and the season home run wager. Pure functions only.
const { hitData, boxscorePlayer } = require('./mlb');

// Each person's picks for Cal's final regular-season home run total.
const WAGER_PICKS = {
  Tim: [54, 55, 56, 60],
  Austin: [53, 57, 58, 59],
  Matt: [61, 62, 63, 64],
};
const SEASON_GAMES = 162;

// Projects the rest of the season at Cal's current HR-per-team-game pace. The
// home runs still to come are modeled as Poisson, so the final total can't drop
// below his current one and the uncertainty shrinks to zero as games run out.
function wagerOdds(currentHR, teamGames, picks = WAGER_PICKS) {
  const played = Math.min(Math.max(teamGames, 0), SEASON_GAMES);
  const expectedMore = played > 0 ? (currentHR / played) * (SEASON_GAMES - played) : 0;

  const chanceOfFinal = total => {
    const more = total - currentHR;
    if (more < 0) return 0;
    let p = Math.exp(-expectedMore);
    for (let i = 1; i <= more; i++) p *= expectedMore / i;
    return p;
  };

  const projected = currentHR + expectedMore;
  const people = Object.entries(picks)
    .map(([name, nums]) => ({
      name,
      picks: nums,
      probability: nums.reduce((sum, n) => sum + chanceOfFinal(n), 0),
      close: nums.some(n => Math.abs(n - projected) <= 2),
    }))
    .sort((a, b) => b.probability - a.probability);
  const noWinner = Math.max(0, 1 - people.reduce((sum, p) => sum + p.probability, 0));

  return { projected: Math.round(projected), people, noWinner };
}

function percent(p) {
  return p > 0 && p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`;
}

function wagerSection(currentHR, teamGames) {
  const { projected, people, noWinner } = wagerOdds(currentHR, teamGames);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = people.map((p, i) =>
    `${medals[i] || '▫️'} ${p.name}: ${percent(p.probability)}${p.close ? ' 🎯' : ''}\n   (${p.picks.join(',')})`
  );
  return `\n\n🎯 WAGER UPDATE\nCurrent: ${currentHR} HR\nProjection: ${projected} HR\n\n` +
    `${lines.join('\n')}\n❌ No Winner: ${percent(noWinner)}`;
}

function statsBlock(stats) {
  if (!stats) return '';
  return `🏆 Cal's ${stats.season} Stats:\n   • HR: ${stats.homeRuns}\n   • RBI: ${stats.rbi}\n` +
    `   • AVG: ${stats.avg}\n   • OPS: ${stats.ops}`;
}

function statsAndWager(stats) {
  return stats ? `\n\n${statsBlock(stats)}${wagerSection(stats.homeRuns, stats.teamGames)}` : '';
}

function matchup(feed) {
  const { away, home } = feed.gameData.teams;
  return `${away.name} @ ${home.name}`;
}

function situation(feed) {
  const ls = feed.liveData?.linescore || {};
  const { away, home } = feed.gameData.teams;
  const inning = ls.currentInning ? ` - ${ls.inningState} ${ls.currentInning}` : '';
  const score = ls.teams ? ` (${away.abbreviation} ${ls.teams.away.runs} - ${home.abbreviation} ${ls.teams.home.runs})` : '';
  return `${matchup(feed)}${inning}${score}`;
}

function homeRun(play, feed, stats, playerId) {
  const { result, about } = play;
  const hit = hitData(play);
  const { away, home } = feed.gameData.teams;
  const regularSeason = feed.gameData.game?.type === 'R';

  // The play description carries the up-to-date count, e.g. "Cal Raleigh homers (42) ..."
  const countInDescription = Number(result.description?.match(/homers \((\d+)\)/)?.[1]);
  const hrCount = countInDescription || stats?.homeRuns || 0;

  let text = `🚨🚨🚨 CAL DINGER! 🚨🚨🚨\n${result.description || 'Home run!'} ⚾💥`;
  text += `\n${about.isTopInning ? 'Top' : 'Bottom'} ${about.inning} • ${result.rbi} RBI 🏃‍♂️`;

  const details = [
    hit.launchSpeed != null && `EV ${hit.launchSpeed} mph`,
    hit.launchAngle != null && `LA ${hit.launchAngle}°`,
    hit.totalDistance != null && `${hit.totalDistance} ft 🚀`,
  ].filter(Boolean);
  if (details.length) text += `\n${details.join(' • ')}`;

  text += `\n\n🏆 ${regularSeason ? 'Season' : 'Postseason'} HR #${hrCount}`;
  text += `\n\n📊 ${away.abbreviation} ${result.awayScore} - ${home.abbreviation} ${result.homeScore}`;

  const today = boxscorePlayer(feed, playerId)?.stats?.batting;
  if (today) {
    text += `\n🏟️ Cal: ${today.hits || 0}/${today.atBats || 0}`;
    if (today.rbi) text += ` • ${today.rbi} RBI`;
    if (today.runs) text += ` • ${today.runs} R`;
  }

  if (stats) {
    const seasonHR = regularSeason ? Math.max(hrCount, stats.homeRuns) : stats.homeRuns;
    text += wagerSection(seasonHR, stats.teamGames);
  }
  return text;
}

function gameStart(feed, stats) {
  const time = new Date(feed.gameData.datetime.dateTime).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  });
  return `⚾🚨 MARINERS GAME STARTED! 🚨⚾\n\n🏟️ ${matchup(feed)}\n📍 ${feed.gameData.venue?.name || ''}\n` +
    `🕐 ${time} PT${statsAndWager(stats)}\n\n🔍 Monitoring for Cal dingers... ⚾💥`;
}

function upToBat(feed) {
  return `⚾🚨 CAL IS UP TO BAT! 🚨⚾\n\n🏟️ ${situation(feed)}\n\n🔍 Monitoring for dinger... ⚾💥`;
}

function atBatResult(play, feed) {
  const { result, about } = play;
  const type = result.eventType || '';
  const emoji =
    ['single', 'double', 'triple'].includes(type) ? '🏃‍♂️' :
    ['walk', 'intent_walk', 'hit_by_pitch'].includes(type) ? '🚶‍♂️' :
    type.startsWith('strikeout') ? '❌' :
    result.isOut ? '🔄' : '⚾';
  let text = `${emoji} CAL'S AT-BAT RESULT: ${result.event || 'At-Bat'} ${emoji}\n\n🏟️ ${situation(feed)}\n📝 ${result.description || ''}`;
  if (result.rbi) text += `\n🏃‍♂️ ${result.rbi} RBI`;
  return `${text}\n⚾ Inning: ${about.isTopInning ? 'Top' : 'Bottom'} ${about.inning}`;
}

function startup(stats) {
  return `🚨🚨🚨 CAL DINGER BOT IS READY! 🚨🚨🚨\n\n⚾ WhatsApp: ✅ Connected\n` +
    `📊 MLB API: ${stats ? '✅ Responding' : '⚠️ Not responding'}${statsAndWager(stats)}\n\n🔍 Monitoring for Cal dingers... ⚾💥`;
}

function healthStatus({ whatsappReady, gamePk, gameStatus, stats, targetCount }) {
  const time = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  return `🏥 CAL DINGER BOT HEALTH STATUS 🏥\n\n⏰ Time: ${time} PT\n` +
    `📱 WhatsApp: ${whatsappReady ? '✅ Connected' : '❌ Disconnected'}\n` +
    `🎮 Game Tracking: ${gamePk ? `✅ Game ${gamePk} (${gameStatus || 'starting soon'})` : '❌ No game right now'}\n` +
    `📊 Sending to: ${targetCount} chat(s)${stats ? `\n\n${statsBlock(stats)}` : ''}`;
}

module.exports = {
  WAGER_PICKS, wagerOdds, wagerSection,
  homeRun, gameStart, upToBat, atBatResult, startup, healthStatus,
};
