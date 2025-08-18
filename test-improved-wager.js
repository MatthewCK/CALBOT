// Test the improved wager calculation functions
const WAGER_DATA = {
  Tim: [54, 55, 56, 60],
  Austin: [53, 57, 58, 59], 
  Matt: [61, 62, 63, 64]
};

function calculateSeasonProjection(currentHRs, currentDate = new Date()) {
  const seasonStart = new Date(currentDate.getFullYear(), 3, 1); // April 1st
  const seasonEnd = new Date(currentDate.getFullYear(), 8, 30); // September 30th
  
  const seasonLength = seasonEnd - seasonStart;
  const currentProgress = currentDate - seasonStart;
  const progressPercent = Math.max(0, Math.min(1, currentProgress / seasonLength));
  
  if (progressPercent === 0) return currentHRs;
  return Math.round(currentHRs / progressPercent);
}

function calculateWagerProbabilities(currentHRs, projectedHRs) {
  // Use normal distribution around projection with standard deviation based on remaining season
  const seasonStart = new Date(new Date().getFullYear(), 3, 1); // April 1st
  const seasonEnd = new Date(new Date().getFullYear(), 8, 30); // September 30th
  const now = new Date();
  
  const seasonProgress = Math.max(0, Math.min(1, (now - seasonStart) / (seasonEnd - seasonStart)));
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
  const projectedHRs = calculateSeasonProjection(currentHRs);
  const probabilities = calculateWagerProbabilities(currentHRs, projectedHRs);
  
  let wagerText = `\n\n🎯 WAGER UPDATE 🎯\n`;
  wagerText += `📊 Current: ${currentHRs} HR\n`;
  wagerText += `📈 Projected: ${projectedHRs} HR\n\n`;
  
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

// Test with Cal's actual stats
console.log('=== IMPROVED WAGER CALCULATION TEST ===');
const currentHRs = 47;
const testDate = new Date('2025-08-18');

const projection = calculateSeasonProjection(currentHRs, testDate);
const probabilities = calculateWagerProbabilities(currentHRs, projection);

console.log(`Current HRs: ${currentHRs}`);
console.log(`Projected: ${projection}`);
console.log(`Season progress: ${((testDate - new Date(2025, 3, 1)) / (new Date(2025, 8, 30) - new Date(2025, 3, 1)) * 100).toFixed(1)}%`);

console.log('\n=== PROBABILITY BREAKDOWN ===');
let totalProb = 0;
Object.entries(probabilities).forEach(([person, data]) => {
  const percent = (data.probability * 100).toFixed(1);
  console.log(`${person}: ${percent}% (${data.numbers.join(',')})`);
  totalProb += data.probability;
});

console.log(`\nTotal probability: ${(totalProb * 100).toFixed(1)}%`);

console.log('\n=== FORMATTED WAGER SECTION ===');
console.log(formatWagerSection(currentHRs));

// Test with different scenarios
console.log('\n=== SCENARIO TESTS ===');

console.log('\nScenario 1: Early season (15 HRs on May 1)');
const earlyDate = new Date('2025-05-01');
const earlyWager = formatWagerSection(15);
console.log(earlyWager);

console.log('\nScenario 2: Late season (Cal way ahead - 55 HRs on Sept 1)');
const lateDate = new Date('2025-09-01');  
const lateWager = formatWagerSection(55);
console.log(lateWager);