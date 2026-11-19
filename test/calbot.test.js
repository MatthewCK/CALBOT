const test = require('node:test');
const assert = require('node:assert');
const mlb = require('../src/mlb');
const messages = require('../src/messages');

const CAL = 663728;

// Shapes match the real /feed/live response (hitData sits on the in-play pitch event).
function play(atBatIndex, batterId, result, hitData) {
  return {
    result: { type: 'atBat', ...result },
    about: { atBatIndex, isTopInning: false, inning: 5, isComplete: true, endTime: '2025-09-24T03:10:00Z' },
    matchup: { batter: { id: batterId } },
    playEvents: [
      { details: { isInPlay: false } },
      { details: { isInPlay: true }, ...(hitData && { hitData }) },
    ],
  };
}

const calHomer = play(41, CAL, {
  event: 'Home Run', eventType: 'home_run', rbi: 2, awayScore: 3, homeScore: 7,
  description: 'Cal Raleigh homers (60) on a fly ball to right center field. J.P. Crawford scores.',
}, { launchSpeed: 107.3, launchAngle: 28, totalDistance: 412 });

const feed = {
  gameData: {
    game: { type: 'R' },
    status: { abstractGameState: 'Live', detailedState: 'In Progress' },
    datetime: { dateTime: '2025-09-24T01:40:00Z' },
    venue: { name: 'T-Mobile Park' },
    teams: {
      away: { id: 115, name: 'Colorado Rockies', abbreviation: 'COL' },
      home: { id: 136, name: 'Seattle Mariners', abbreviation: 'SEA' },
    },
  },
  liveData: {
    plays: {
      allPlays: [
        calHomer,
        play(42, 999, { event: 'Home Run', eventType: 'home_run', rbi: 1, description: 'Someone else homers (12).' }),
        play(50, CAL, { event: 'Flyout', eventType: 'field_out', isOut: true, description: 'Cal Raleigh flies out. Robbed of a home run.' }),
      ],
      currentPlay: null,
    },
    linescore: { currentInning: 5, inningState: 'Bottom', teams: { away: { runs: 3 }, home: { runs: 7 } } },
    boxscore: {
      teams: {
        away: { players: {} },
        home: { players: { [`ID${CAL}`]: { stats: { batting: { hits: 2, atBats: 3, rbi: 3, runs: 1 } } } } },
      },
    },
  },
};

const stats = { season: 2025, homeRuns: 59, rbi: 120, avg: '.245', ops: '.950', teamGames: 156 };

test('finds only Cal home runs, by event type', () => {
  const found = mlb.homeRunsBy(feed, CAL);
  assert.deepStrictEqual(found.map(p => p.about.atBatIndex), [41]);
});

test('play keys are unique across games', () => {
  assert.notStrictEqual(mlb.playKey(1, calHomer), mlb.playKey(2, calHomer));
});

test('isOver covers final, postponed and suspended games', () => {
  assert.ok(mlb.isOver({ abstractGameState: 'Final', detailedState: 'Final' }));
  assert.ok(mlb.isOver({ abstractGameState: 'Final', detailedState: 'Postponed' }));
  assert.ok(mlb.isOver({ abstractGameState: 'Live', detailedState: 'Suspended: Rain' }));
  assert.ok(!mlb.isOver({ abstractGameState: 'Live', detailedState: 'Delayed: Rain' }));
  assert.ok(!mlb.isOver({ abstractGameState: 'Live', detailedState: 'Manager challenge' }));
});

test('home run message includes Statcast data, live HR count, score and game line', () => {
  const text = messages.homeRun(calHomer, feed, stats, CAL);
  assert.match(text, /CAL DINGER!/);
  assert.match(text, /Bottom 5 • 2 RBI/);
  assert.match(text, /EV 107.3 mph • LA 28° • 412 ft/);
  assert.match(text, /Season HR #60/); // from the description, even though stats still say 59
  assert.match(text, /COL 3 - SEA 7/);
  assert.match(text, /Cal: 2\/3 • 3 RBI • 1 R/);
  assert.match(text, /WAGER UPDATE\nCurrent: 60 HR/);
});

test('home run message works without stats', () => {
  const text = messages.homeRun(calHomer, feed, null, CAL);
  assert.match(text, /Season HR #60/);
  assert.doesNotMatch(text, /WAGER/);
});

test('wager odds add up to 100%', () => {
  const { people, noWinner } = messages.wagerOdds(40, 110);
  const total = people.reduce((s, p) => s + p.probability, 0) + noWinner;
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('wager projection never drops below the current total', () => {
  const { projected, people } = messages.wagerOdds(57, 150);
  assert.ok(projected >= 57);
  const austin = people.find(p => p.name === 'Austin');
  // 53 is already impossible, so Austin's odds only come from 57-59.
  assert.ok(austin.probability > 0);
  assert.strictEqual(messages.wagerOdds(57, 150, { X: [53] }).people[0].probability, 0);
});

test('wager is settled once the season is over', () => {
  const { people, noWinner } = messages.wagerOdds(60, 162);
  assert.strictEqual(people[0].name, 'Tim');
  assert.strictEqual(people[0].probability, 1);
  assert.strictEqual(noWinner, 0);
});

test('situation line for the console shows inning and score', () => {
  assert.strictEqual(messages.situation(feed), 'Colorado Rockies @ Seattle Mariners - Bottom 5 (COL 3 - SEA 7)');
});
