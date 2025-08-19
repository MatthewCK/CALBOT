// PROPOSED FIX for the infinite polling issue

// Add these variables at the top of server.js
let calIsUpToBat = false;
let calCurrentAtBatIndex = null; // Track specific at-bat
let calAtBatStartTime = null; // Timeout protection

async function checkIfCalIsUpToBat(gamePk) {
  try {
    const feed = await fetchLiveFeed(gamePk);
    const liveData = feed?.liveData;
    
    if (!liveData) return false;
    
    // Check if Cal is the current batter
    const currentPlay = liveData?.plays?.currentPlay;
    const currentBatter = currentPlay?.matchup?.batter;
    const currentAtBatIndex = currentPlay?.about?.atBatIndex;
    
    if (currentBatter && String(currentBatter.id) === String(CAL_RALEIGH_PLAYER_ID)) {
      if (!calIsUpToBat || calCurrentAtBatIndex !== currentAtBatIndex) {
        console.log(`🚨 CAL IS UP TO BAT! 🚨 (At-bat index: ${currentAtBatIndex})`);
        calIsUpToBat = true;
        calCurrentAtBatIndex = currentAtBatIndex;
        calAtBatStartTime = Date.now();
        updatePollInterval();
        
        // Send notification that Cal is up to bat (currently disabled)
        // const message = `⚾🚨 CAL IS UP TO BAT! 🚨⚾\n\n🏟️ ${getGameInfoString()}\n\n🔍 Monitoring for dinger... ⚾💥`;
        // await sendWhatsApp(message);
      }
      return true;
    }
    
    // Check if Cal just finished his at-bat
    if (calIsUpToBat) {
      // Method 1: Check if the specific at-bat has a result
      const allPlays = liveData?.plays?.allPlays || [];
      const calAtBat = allPlays.find(play => 
        String(play?.matchup?.batter?.id) === String(CAL_RALEIGH_PLAYER_ID) &&
        play?.about?.atBatIndex === calCurrentAtBatIndex
      );
      
      // Method 2: Timeout protection (max 10 minutes per at-bat)
      const timeoutReached = calAtBatStartTime && (Date.now() - calAtBatStartTime > 10 * 60 * 1000);
      
      // Cal finished if: at-bat has result OR timeout reached
      if ((calAtBat?.result?.eventType) || timeoutReached) {
        const reason = timeoutReached ? 'timeout' : calAtBat?.result?.eventType;
        console.log(`Cal finished his at-bat (${reason}), switching back to 10-second polling`);
        
        calIsUpToBat = false;
        calCurrentAtBatIndex = null;
        calAtBatStartTime = null;
        updatePollInterval();
        
        // Send notification with at-bat result (currently disabled)
        if (!timeoutReached) {
          await sendCalAtBatResult(gamePk);
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking if Cal is up to bat:', error.message);
    
    // Reset flags on error to prevent getting stuck
    if (calIsUpToBat) {
      console.log('Resetting Cal at-bat flags due to error');
      calIsUpToBat = false;
      calCurrentAtBatIndex = null;
      calAtBatStartTime = null;
      updatePollInterval();
    }
    
    return false;
  }
}

console.log('=== PROPOSED FIX BENEFITS ===');
console.log('✅ Tracks specific at-bat index, not just current batter');
console.log('✅ Only resets when that specific at-bat has a result');
console.log('✅ Timeout protection prevents infinite loops');
console.log('✅ Error handling resets flags if something goes wrong');
console.log('✅ More robust detection of at-bat completion');

console.log('\n=== HOW IT FIXES THE ISSUE ===');
console.log('1. Cal comes up → Track at-bat index 45');
console.log('2. Cal grounds out → at-bat 45 gets eventType: "groundout"');
console.log('3. Next batter comes up → Current play moves to at-bat 46');
console.log('4. Logic sees at-bat 45 has result → Resets calIsUpToBat = false');
console.log('5. No more infinite 1-second polling!');

console.log('\n=== SAFETY FEATURES ===');
console.log('• 10-minute timeout per at-bat');
console.log('• Error handling resets flags');
console.log('• Specific at-bat tracking prevents false resets');
console.log('• Logs show exactly which at-bat is being tracked');