// Test the enhanced dinger message with game score
console.log('=== ENHANCED CAL DINGER MESSAGE WITH SCORE ===');
console.log('Now includes current game score AND Cal\'s game stats!');
console.log('');

// Simulate different game scenarios
const scenarios = [
  {
    title: 'Close game - Cal ties it up!',
    message: `🚨🚨🚨 CAL DINGER! 🚨🚨🚨 Cal Raleigh homers (48). ⚾💥 • Bottom 7 ⚾ • 2 RBI 🏃‍♂️ • EV 109.3 mph 💨 • LA 22° 📐 • 434 ft 🚀 • Season HR #48 🏆

📊 SCORE: SEA 5 - PHI 5
🏟️ CAL'S GAME: 2/3 • 3 RBI • 2 R

🎯 WAGER UPDATE 🎯
📊 Current: 48 HR
📈 Linear Projection: 63 HR

🥇 Matt: 52% (61,62,63,64) 🎯`
  },
  {
    title: 'Blowout game - Cal padding stats',
    message: `🚨🚨🚨 CAL DINGER! 🚨🚨🚨 Cal Raleigh homers (48). ⚾💥 • Top 8 ⚾ • 3 RBI 🏃‍♂️ • EV 112.7 mph 💨 • LA 28° 📐 • 447 ft 🚀 • Season HR #48 🏆

📊 SCORE: BOS 2 - SEA 9
🏟️ CAL'S GAME: 3/4 • 5 RBI • 3 R

🎯 WAGER UPDATE 🎯
📊 Current: 48 HR
📈 Linear Projection: 63 HR

🥇 Matt: 52% (61,62,63,64) 🎯`
  },
  {
    title: 'Walk-off hero!',
    message: `🚨🚨🚨 CAL DINGER! 🚨🚨🚨 Cal Raleigh homers (48). ⚾💥 • Bottom 9 ⚾ • 1 RBI 🏃‍♂️ • EV 106.8 mph 💨 • LA 25° 📐 • 398 ft 🚀 • Season HR #48 🏆

📊 SCORE: SEA 7 - LAA 6
🏟️ CAL'S GAME: 1/4 • 1 RBI • 1 R

🎯 WAGER UPDATE 🎯
📊 Current: 48 HR
📈 Linear Projection: 63 HR

🥇 Matt: 52% (61,62,63,64) 🎯`
  }
];

scenarios.forEach((scenario, index) => {
  console.log(`=== SCENARIO ${index + 1}: ${scenario.title.toUpperCase()} ===`);
  console.log(scenario.message);
  console.log('');
});

console.log('=== NEW INFORMATION PROVIDED ===');
console.log('📊 SCORE: Shows current game score (away - home format)');
console.log('🏟️ CAL\'S GAME: Cal\'s individual performance this game');
console.log('');
console.log('✨ BENEFITS:');
console.log('   • Immediate context: Is this a big moment?');
console.log('   • Game situation: Close game vs blowout');
console.log('   • Cal\'s hot streak: Having a great game or clutch hit?');
console.log('   • Excitement level: Walk-off vs garbage time');
console.log('');
console.log('🎯 Perfect for the group chat - everyone knows exactly what\'s happening!');

console.log('\n=== SCORE FORMAT EXAMPLES ===');
const scoreExamples = [
  'SEA 4 - NYY 2 (Mariners ahead, away game)',
  'LAD 7 - SEA 3 (Mariners behind, home game)', 
  'SEA 0 - TEX 0 (Tied game, away)',
  'OAK 1 - SEA 8 (Mariners crushing, home game)'
];

scoreExamples.forEach((example, index) => {
  console.log(`${index + 1}. 📊 SCORE: ${example.split(' (')[0]} - ${example.split(' (')[1]}`);
});