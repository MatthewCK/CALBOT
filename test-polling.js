// Test the dynamic polling system
let nextPollTime = null;
let pollTimer = null;

function scheduleNextPoll(overrideDelay = null) {
  // Clear existing timer
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  
  let delay;
  if (overrideDelay !== null) {
    delay = overrideDelay;
  } else if (nextPollTime) {
    delay = Math.max(0, nextPollTime.getTime() - Date.now());
  } else {
    delay = 5000; // Default 5 seconds if no nextPollTime set
  }
  
  console.log(`Next poll scheduled in ${Math.round(delay / 1000)} seconds`);
  pollTimer = setTimeout(() => {
    console.log('Poll executed at:', new Date().toISOString());
    // Simulate different polling intervals
    testPolling();
  }, delay);
}

function testPolling() {
  const now = new Date();
  console.log('Current time:', now.toISOString());
  
  // Simulate different scenarios
  const scenarios = [
    { name: 'Cal up to bat', delay: 1000 },
    { name: 'Game in progress', delay: 10000 },
    { name: 'Pre-game', delay: 300000 }
  ];
  
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  console.log(`Scenario: ${scenario.name} - next poll in ${scenario.delay/1000}s`);
  
  // Set next poll time
  nextPollTime = new Date(Date.now() + scenario.delay);
  
  // Schedule next poll
  scheduleNextPoll();
}

console.log('Testing dynamic polling system...');
console.log('Expected: Different intervals based on scenario');
console.log('1 second = Cal batting, 10 seconds = Game active, 300 seconds = Pre-game');
console.log('');

// Start test
scheduleNextPoll(1000); // Start in 1 second

// Stop test after 30 seconds
setTimeout(() => {
  console.log('Test complete - stopping polls');
  if (pollTimer) clearTimeout(pollTimer);
}, 30000);