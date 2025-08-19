// Test mobile-optimized WhatsApp message format
console.log('=== MOBILE-OPTIMIZED CAL DINGER MESSAGE ===');
console.log('Formatted for WhatsApp mobile viewing');
console.log('');

// Simulate the mobile-optimized message
const mobileOptimizedMessage = `🚨🚨🚨 CAL DINGER! 🚨🚨🚨
Cal Raleigh homers (48). ⚾💥
Bottom 7 • 2 RBI 🏃‍♂️
EV 109.3 mph • LA 22° • 434 ft 🚀

🏆 Season HR #48

📊 SEA 5 - PHI 5
🏟️ Cal: 2/3 • 3 RBI • 2 R

🎯 WAGER UPDATE
Current: 48 HR
Projected: 63 HR

🥇 Matt: 52% 🎯
   (61,62,63,64)
🥈 Austin: 28%
   (53,57,58,59)
🥉 Tim: 15%
   (54,55,56,60)
❌ No Winner: 5%`;

console.log(mobileOptimizedMessage);

console.log('\n=== MOBILE OPTIMIZATION BENEFITS ===');
console.log('✅ Shorter lines - fits phone screen width');
console.log('✅ Strategic line breaks - easier to read');
console.log('✅ Wager numbers on separate lines - cleaner');
console.log('✅ Removed excessive symbols - less cluttered');
console.log('✅ Key info grouped together - better scanning');

console.log('\n=== BEFORE vs AFTER COMPARISON ===');
console.log('');
console.log('❌ BEFORE (too wide):');
console.log('🚨🚨🚨 CAL DINGER! 🚨🚨🚨 Cal Raleigh homers (48). ⚾💥 • Bottom 7 ⚾ • 2 RBI 🏃‍♂️ • EV 109.3 mph 💨 • LA 22° 📐 • 434 ft 🚀 • Season HR #48 🏆');
console.log('🥇 Matt: 52% (61,62,63,64) 🎯');
console.log('');
console.log('✅ AFTER (mobile-friendly):');
console.log('🚨🚨🚨 CAL DINGER! 🚨🚨🚨');
console.log('Cal Raleigh homers (48). ⚾💥');
console.log('Bottom 7 • 2 RBI 🏃‍♂️');
console.log('EV 109.3 mph • LA 22° • 434 ft 🚀');
console.log('🥇 Matt: 52% 🎯');
console.log('   (61,62,63,64)');

console.log('\n=== DIFFERENT SCENARIOS ===');

const scenarios = [
  {
    title: 'Walk-off Hero',
    message: `🚨🚨🚨 CAL DINGER! 🚨🚨🚨
Cal Raleigh homers (49). ⚾💥
Bottom 9 • 1 RBI 🏃‍♂️
EV 106.8 mph • LA 25° • 398 ft 🚀

🏆 Season HR #49

📊 SEA 7 - LAA 6
🏟️ Cal: 1/4 • 1 RBI • 1 R

🎯 WAGER UPDATE
Current: 49 HR
Projected: 64 HR

🥇 Matt: 65% 🎯
   (61,62,63,64)`
  },
  {
    title: 'Multi-HR Game',
    message: `🚨🚨🚨 CAL DINGER! 🚨🚨🚨
Cal Raleigh homers (50). ⚾💥
Top 8 • 3 RBI 🏃‍♂️
EV 112.1 mph • LA 28° • 441 ft 🚀

🏆 Season HR #50

📊 BOS 3 - SEA 8
🏟️ Cal: 3/3 • 6 RBI • 3 R

🎯 WAGER UPDATE
Current: 50 HR
Projected: 65 HR

🥇 Matt: 72% 🎯
   (61,62,63,64)`
  }
];

scenarios.forEach((scenario, index) => {
  console.log(`\n--- ${scenario.title.toUpperCase()} ---`);
  console.log(scenario.message);
});

console.log('\n📱 Perfect for mobile WhatsApp viewing!');