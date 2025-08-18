// Test the wager calculation functions
const WAGER_DATA = {
  Tim: [54, 55, 56, 60],
  Austin: [53, 57, 58, 59], 
  Matt: [61, 62, 63, 64]
};

function calculateSeasonProjection(currentHRs, currentDate = new Date()) {
  // MLB season typically runs from early April to late September/early October
  const seasonStart = new Date(currentDate.getFullYear(), 3, 1); // April 1st
  const seasonEnd = new Date(currentDate.getFullYear(), 8, 30); // September 30th
  
  const seasonLength = seasonEnd - seasonStart;
  const currentProgress = currentDate - seasonStart;
  const progressPercent = Math.max(0, Math.min(1, currentProgress / seasonLength));
  
  if (progressPercent === 0) return currentHRs; // Season hasn't started
  
  // Project full season based on current pace
  return Math.round(currentHRs / progressPercent);
}

function calculateWagerProbabilities(currentHRs, projectedHRs) {
  const results = {};
  
  for (const [person, numbers] of Object.entries(WAGER_DATA)) {
    // Calculate how many of their numbers the projection could hit
    const minNumber = Math.min(...numbers);
    const maxNumber = Math.max(...numbers);
    
    // Simple probability based on how close projection is to their range
    let probability;
    if (projectedHRs >= minNumber && projectedHRs <= maxNumber) {
      // Projection is in their range - high probability
      probability = 0.7 + (0.2 * Math.random()); // 70-90%
    } else {
      // Calculate distance from their range
      const distanceFromRange = Math.min(
        Math.abs(projectedHRs - minNumber),
        Math.abs(projectedHRs - maxNumber)
      );
      
      // Closer = higher probability
      const maxDistance = 20; // Arbitrary max distance for scaling
      probability = Math.max(0.05, 0.4 - (distanceFromRange / maxDistance) * 0.35);
    }
    
    results[person] = {
      numbers: numbers,
      probability: Math.min(0.95, Math.max(0.05, probability)), // Cap between 5% and 95%
      inRange: projectedHRs >= minNumber && projectedHRs <= maxNumber
    };
  }
  
  return results;
}

function formatWagerSection(currentHRs, seasonStats = null) {
  const projectedHRs = calculateSeasonProjection(currentHRs);
  const probabilities = calculateWagerProbabilities(currentHRs, projectedHRs);
  
  let wagerText = `\n\n🎯 WAGER UPDATE 🎯\n`;
  wagerText += `📊 Current: ${currentHRs} HR\n`;
  wagerText += `📈 Projected: ${projectedHRs} HR\n\n`;
  
  // Sort by probability (highest first)
  const sortedResults = Object.entries(probabilities)
    .sort(([,a], [,b]) => b.probability - a.probability);
  
  sortedResults.forEach(([person, data], index) => {
    const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
    const percentStr = (data.probability * 100).toFixed(0);
    const numbersStr = data.numbers.join(',');
    const indicator = data.inRange ? '🎯' : '';
    
    wagerText += `${emoji} ${person}: ${percentStr}% (${numbersStr}) ${indicator}\n`;
  });
  
  return wagerText;
}

// Test with Cal's current stats (9 HRs from our earlier debug)
console.log('=== WAGER CALCULATION TEST ===');
console.log('Testing with Cal\'s current 9 HRs');
console.log('Date: August 18, 2025');

const testDate = new Date('2025-08-18');
const currentHRs = 9;

console.log('\n=== Season Projection ===');
const projection = calculateSeasonProjection(currentHRs, testDate);
console.log(`Current HRs: ${currentHRs}`);
console.log(`Projected season total: ${projection}`);

console.log('\n=== Win Probabilities ===');
const probabilities = calculateWagerProbabilities(currentHRs, projection);
Object.entries(probabilities).forEach(([person, data]) => {
  console.log(`${person}: ${(data.probability * 100).toFixed(0)}% (${data.numbers.join(',')}) ${data.inRange ? '🎯 IN RANGE' : ''}`);
});

console.log('\n=== Full Wager Section ===');
console.log(formatWagerSection(currentHRs));

// Test edge cases
console.log('\n=== EDGE CASE TESTS ===');
console.log('\nTest 1: Early season (April 15)');
const earlyDate = new Date('2025-04-15');
const earlyProjection = calculateSeasonProjection(5, earlyDate);
console.log(`5 HRs on April 15 projects to: ${earlyProjection}`);

console.log('\nTest 2: Late season (September 15)');
const lateDate = new Date('2025-09-15');
const lateProjection = calculateSeasonProjection(50, lateDate);
console.log(`50 HRs on Sept 15 projects to: ${lateProjection}`);