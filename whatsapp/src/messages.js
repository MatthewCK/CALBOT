// WhatsApp message text (home run alert, status reply) and the wager odds. Pure functions only.
const config = require('./config');
const { hitData, boxscorePlayer, lineupStatus } = require('./mlb');

const NAME = config.playerName;
const SEASON_GAMES = 162;
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

// Projects the rest of the season at the player's current HR-per-team-game pace. The
// home runs still to come are modeled as Poisson, so the final total can't drop
// below his current one and the uncertainty shrinks to zero as games run out.
function wagerOdds(currentHR, teamGames, picks = config.wagerPicks) {
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

// Empty when no WAGER_PICKS are configured.
function wagerSection(currentHR, teamGames) {
  if (!Object.keys(config.wagerPicks).length) return '';
  const { projected, people, noWinner } = wagerOdds(currentHR, teamGames);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = people.map((p, i) =>
    `${medals[i] || '▫️'} ${p.name}: ${percent(p.probability)}${p.close ? ' 🎯' : ''}\n   (${p.picks.join(',')})`
  );
  return `\n\n🎯 WAGER UPDATE\nCurrent: ${currentHR} HR\nProjection: ${projected} HR\n\n` +
    `${lines.join('\n')}\n❌ No Winner: ${percent(noWinner)}`;
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

function localTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZoneName: 'short', timeZone: config.timeZone,
  });
}

function homeRun(play, feed, stats) {
  const { result, about } = play;
  const hit = hitData(play);
  const { away, home } = feed.gameData.teams;
  const regularSeason = feed.gameData.game?.type === 'R';

  // The play description carries the up-to-date count, e.g. "Cal Raleigh homers (42) ..."
  const countInDescription = Number(result.description?.match(/homers \((\d+)\)/)?.[1]);
  const hrCount = countInDescription || stats?.homeRuns || 0;

  let text = `🚨🚨🚨 ${NAME.toUpperCase()} DINGER! 🚨🚨🚨\n${result.description || 'Home run!'} ⚾💥`;
  text += `\n${about.isTopInning ? 'Top' : 'Bottom'} ${about.inning} • ${result.rbi} RBI 🏃‍♂️`;

  const details = [
    hit.launchSpeed != null && `EV ${hit.launchSpeed} mph`,
    hit.launchAngle != null && `LA ${hit.launchAngle}°`,
    hit.totalDistance != null && `${hit.totalDistance} ft 🚀`,
  ].filter(Boolean);
  if (details.length) text += `\n${details.join(' • ')}`;

  text += `\n\n🏆 ${regularSeason ? 'Season' : 'Postseason'} HR #${hrCount}`;
  text += `\n\n📊 ${away.abbreviation} ${result.awayScore} - ${home.abbreviation} ${result.homeScore}`;

  const today = boxscorePlayer(feed, config.playerId)?.stats?.batting;
  if (today) {
    text += `\n🏟️ ${NAME}: ${today.hits || 0}/${today.atBats || 0}`;
    if (today.rbi) text += ` • ${today.rbi} RBI`;
    if (today.runs) text += ` • ${today.runs} R`;
  }

  if (stats) {
    const seasonHR = regularSeason ? Math.max(hrCount, stats.homeRuns) : stats.homeRuns;
    text += wagerSection(seasonHR, stats.teamGames);
  }
  return text;
}

function whenUp({ battersAhead, teamBatting }) {
  if (!teamBatting) {
    return battersAhead === 0 ? `${NAME} leads off next inning`
      : `${NAME} is due up ${ORDINALS[battersAhead]} next inning`;
  }
  if (battersAhead === 0) return `${NAME} is batting right now! 👀`;
  if (battersAhead === 1) return `${NAME} is on deck`;
  if (battersAhead === 2) return `${NAME} is in the hole`;
  return `${NAME} is up after ${battersAhead} more batters`;
}

// Reply to the status command: the bot is up, plus the current or next game and the player's numbers.
function status({ feed, nextGame, stats }) {
  let text = `🤖 ${NAME.toUpperCase()} DINGER BOT: ✅ Online`;
  const state = feed?.gameData.status.abstractGameState;
  const lineup = feed && lineupStatus(feed, config.playerId, config.teamId);

  if (state === 'Live') {
    text += `\n\n⚾ ${situation(feed)}`;
    if (feed.gameData.status.detailedState !== 'In Progress') text += `\n⏸️ ${feed.gameData.status.detailedState}`;
    const today = boxscorePlayer(feed, config.playerId)?.stats?.batting;
    if (today?.plateAppearances || today?.atBats) {
      text += `\n🏏 ${NAME} today: ${today.hits || 0}/${today.atBats || 0}`;
      if (today.homeRuns) text += ` • ${today.homeRuns} HR`;
      if (today.rbi) text += ` • ${today.rbi} RBI`;
    }
    text += `\n⏭️ ${lineup ? whenUp(lineup) : `${NAME} isn't in the lineup`}`;
  } else if (state === 'Preview') {
    text += `\n\n⚾ ${matchup(feed)}\n🕐 ${localTime(feed.gameData.datetime.dateTime)}`;
    text += `\n📋 ${lineup ? `${NAME} is batting ${ORDINALS[lineup.spot - 1]}` : 'Lineup not posted yet'}`;
  } else if (nextGame) {
    text += `\n\n📅 Next game: ${nextGame.teams.away.team.name} @ ${nextGame.teams.home.team.name}` +
      `\n🕐 ${localTime(nextGame.gameDate)}`;
  } else {
    text += '\n\n📅 No games in the next 10 days';
  }

  if (stats) text += `\n\n🏆 Season: ${stats.homeRuns} HR${wagerSection(stats.homeRuns, stats.teamGames)}`;
  return text;
}

module.exports = { wagerOdds, wagerSection, homeRun, situation, status };
