// Test games-based calculation
const WAGER_DATA = {
  Tim: [54, 55, 56, 60],
  Austin: [53, 57, 58, 59], 
  Matt: [61, 62, 63, 64]
};

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

// Test with Cal's actual stats
const currentHRs = 47;
const actualSeasonStats = {
  homeRuns: 47,
  gamesPlayed: 123,
  rbi: 102,
  avg: 0.251,
  ops: 0.956
};

console.log('=== GAMES-BASED VS DATE-BASED COMPARISON ===');
console.log(`Cal's actual stats: ${currentHRs} HR in ${actualSeasonStats.gamesPlayed} games`);

// Games-based calculation
const gamesProjection = calculateSeasonProjection(currentHRs, actualSeasonStats);
const gamesProgress = (actualSeasonStats.gamesPlayed / 162 * 100).toFixed(1);

console.log(`\\n📊 GAMES-BASED CALCULATION:`);
console.log(`Games played: ${actualSeasonStats.gamesPlayed}/162 (${gamesProgress}%)`);
console.log(`Projected: ${gamesProjection} HR`);

// Date-based calculation (old method)
const testDate = new Date('2025-08-18');
const seasonStart = new Date(2025, 3, 1); // April 1st
const seasonEnd = new Date(2025, 8, 30); // September 30th
const dateProgress = ((testDate - seasonStart) / (seasonEnd - seasonStart) * 100).toFixed(1);
const dateProjection = Math.round(currentHRs / (dateProgress / 100));

console.log(`\\n📅 DATE-BASED CALCULATION:`);
console.log(`Date progress: ${dateProgress}% (Aug 18 of season)`);
console.log(`Projected: ${dateProjection} HR`);

console.log(`\\n🔍 DIFFERENCE:`);
console.log(`Games-based is ${gamesProgress > dateProgress ? 'ahead' : 'behind'} date-based by ${Math.abs(parseFloat(gamesProgress) - parseFloat(dateProgress)).toFixed(1)}%`);
console.log(`Projection difference: ${gamesProjection - dateProjection} HR`);

// Calculate what this means for win probabilities
console.log(`\\n🎯 IMPACT ON WAGER:`);
console.log(`Games-based (${gamesProjection} HR): Most likely Matt wins (61-64 range)`);
console.log(`Date-based (${dateProjection} HR): Most likely ${dateProjection >= 61 ? 'Matt' : dateProjection >= 57 ? 'Austin' : 'Tim'} wins`);

// Show remaining games impact
const remainingGames = 162 - actualSeasonStats.gamesPlayed;
const remainingHRsPace = gamesProjection - currentHRs;
console.log(`\\n⚾ REMAINING SEASON:`);
console.log(`Games left: ${remainingGames}`);
console.log(`HR pace for remaining games: ${remainingHRsPace} (${(remainingHRsPace/remainingGames).toFixed(2)} HR/game)`);
console.log(`Current pace: ${(currentHRs/actualSeasonStats.gamesPlayed).toFixed(2)} HR/game`);