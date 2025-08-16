require('dotenv').config();

const MARINERS_TEAM_ID = process.env.MARINERS_TEAM_ID || '136';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function getTodayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function testMLBAPI() {
  console.log('Testing MLB API...');
  console.log('Current date:', getTodayDateString());
  console.log('Mariners Team ID:', MARINERS_TEAM_ID);
  
  // Test 1: Without sportId (should fail)
  console.log('\n=== Test 1: Without sportId ===');
  try {
    const date = getTodayDateString();
    const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&teamId=${MARINERS_TEAM_ID}`;
    console.log('URL:', url);
    const data = await fetchJson(url);
    console.log('SUCCESS (unexpected):', JSON.stringify(data, null, 2));
  } catch (error) {
    console.log('EXPECTED ERROR:', error.message);
  }
  
  // Test 2: With sportId=1 (should work)
  console.log('\n=== Test 2: With sportId=1 ===');
  try {
    const date = getTodayDateString();
    const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&teamId=${MARINERS_TEAM_ID}&sportId=1`;
    console.log('URL:', url);
    const data = await fetchJson(url);
    console.log('SUCCESS:', JSON.stringify(data, null, 2));
    
    // Check if there are any games
    if (data?.dates && data.dates.length > 0) {
      const games = data.dates[0]?.games || [];
      console.log(`Found ${games.length} games today`);
      games.forEach((game, index) => {
        console.log(`Game ${index + 1}:`, {
          gamePk: game.gamePk,
          status: game.status?.detailedState,
          teams: `${game.teams?.away?.team?.name} @ ${game.teams?.home?.team?.name}`
        });
      });
    } else {
      console.log('No games found for today');
    }
  } catch (error) {
    console.log('ERROR:', error.message);
  }
  
  // Test 3: Try with different sportId values
  console.log('\n=== Test 3: Different sportId values ===');
  const sportIds = [1, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
  
  for (const sportId of sportIds) {
    try {
      const date = getTodayDateString();
      const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&teamId=${MARINERS_TEAM_ID}&sportId=${sportId}`;
      const data = await fetchJson(url);
      if (data?.dates && data.dates.length > 0 && data.dates[0]?.games?.length > 0) {
        console.log(`sportId=${sportId}: SUCCESS - Found ${data.dates[0].games.length} games`);
      } else {
        console.log(`sportId=${sportId}: No games found`);
      }
    } catch (error) {
      console.log(`sportId=${sportId}: ERROR - ${error.message}`);
    }
  }
}

testMLBAPI().catch(console.error);
