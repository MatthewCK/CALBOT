// Test the enhanced dinger message with game stats
console.log('=== ENHANCED CAL DINGER MESSAGE ===');
console.log('Now includes current game performance!');
console.log('');

// Simulate what the enhanced message looks like
const enhancedDingerMessage = `🚨🚨🚨 CAL DINGER! 🚨🚨🚨 Cal Raleigh homers (48). ⚾💥 • Bottom 7 ⚾ • 2 RBI 🏃‍♂️ • EV 109.3 mph 💨 • LA 22° 📐 • 434 ft 🚀 • Season HR #48 🏆

🏟️ GAME STATS: 2/3 • 3 RBI • 2 R

🎯 WAGER UPDATE 🎯
📊 Current: 48 HR
📈 Linear Projection: 63 HR

🥇 Matt: 52% (61,62,63,64) 🎯
🥈 Austin: 28% (53,57,58,59)
🥉 Tim: 15% (54,55,56,60)
❌ No Winner: 5%`;

console.log(enhancedDingerMessage);

console.log('\n=== NEW GAME STATS SECTION BREAKDOWN ===');
console.log('🏟️ GAME STATS: Shows Cal\'s performance in the current game');
console.log('   • 2/3 = 2 hits in 3 at-bats');
console.log('   • 3 RBI = Runs batted in this game');
console.log('   • 2 R = Runs scored this game');
console.log('');
console.log('This gives immediate context for how Cal is performing TODAY!');

console.log('\n=== POSSIBLE GAME STAT VARIATIONS ===');

const variations = [
  { scenario: 'First AB of game (home run)', stats: '1/1 • 2 RBI • 1 R' },
  { scenario: 'Having a great game', stats: '3/4 • 5 RBI • 3 R' },
  { scenario: 'Struggling but hits HR', stats: '1/3 • 1 RBI' },
  { scenario: 'Multi-HR game!', stats: '2/2 • 4 RBI • 2 R' },
  { scenario: 'Late game heroics', stats: '1/4 • 3 RBI • 1 R' }
];

variations.forEach((variation, index) => {
  console.log(`${index + 1}. ${variation.scenario}: 🏟️ GAME STATS: ${variation.stats}`);
});

console.log('\n✨ PERFECT! Now the group knows exactly how Cal is doing in this specific game!');
console.log('📊 More context = More excitement for the wager implications!');