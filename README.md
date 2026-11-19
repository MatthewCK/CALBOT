# CALBOT - Cal Raleigh Home Run Notifier

A WhatsApp bot that messages your friends when Cal Raleigh hits a home run. 🏟️⚾

## How It Works

1. **Find the next game:** Checks the MLB schedule for the next Mariners regular-season or postseason game, then sleeps until 5 minutes before first pitch.
2. **Watch it:** Polls the live game feed every 15 seconds (`POLL_INTERVAL_MS`) until the game is final, postponed or suspended. Then it looks for the next game, including the second game of a doubleheader.
3. **Spot Cal's home runs:** Any completed play with event type `home_run` and Cal as the batter.
4. **Send the alert:** Posts a "CAL DINGER!" message with the description, inning, RBIs, exit velocity, launch angle, distance, season HR number, score, Cal's line for the game and the wager update.
5. **No repeats:** Home runs are tracked by game and play number and saved to `.calbot-sent.json`, so a crash or restart doesn't re-send them. After a redeploy (which wipes that file), home runs that ended more than 10 minutes before the bot first looks at the game are treated as already sent.

The service is meant to run during the season and be shut down by hand in the offseason.

### Wager

Tim, Austin and Matt each picked four possible final regular-season home run totals. The picks live in `WAGER_PICKS` at the top of `src/messages.js`:

| Person | Picks |
|---|---|
| Tim | 54, 55, 56, 60 |
| Austin | 53, 57, 58, 59 |
| Matt | 61, 62, 63, 64 |

The bot projects the rest of the season at Cal's current pace: his home runs per Mariners game, times the games left. It models the home runs still to come as a Poisson distribution. That means the final total can never fall below his current one, and the odds settle to 100% for the winner once all 162 games are played.

### WhatsApp Connection

The bot uses `whatsapp-web.js`, which runs WhatsApp Web in a hidden Chrome browser. If the connection drops, or a check every 5 minutes finds it isn't connected, the process exits and Railway restarts it. The saved login in `.wwebjs_auth/` (inside `DATA_DIR`) lets it reconnect without scanning again. Messages sent before WhatsApp finishes connecting are held (up to 20) and sent once it's ready.

## What Gets Sent

Only home run alerts are sent on their own. For diagnostics and testing, the console log also shows game status changes (pre-game, in progress, delays, final), when Cal comes up to bat, and how each of his at-bats ended.

## Checking on the Bot: `!cal`

Anyone in the group (or a chat listed in `RECIPIENT_NUMBERS`) can send `!cal` to check the bot is awake. It replies with:

- ✅ Online, which shows the bot and its WhatsApp connection are working
- During a game: inning and score, Cal's line today, and when he's up next ("on deck", "in the hole", "up after 4 more batters", "due up 2nd next Mariners inning")
- Before a game: start time and where Cal is batting in the lineup
- Between games: when the next game starts
- Cal's season home runs and the wager odds

It only answers in the chats it sends alerts to, and replies at most once every 10 seconds per chat.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file:
```
PORT=3000

# Where to send messages (use one or both)
# Phone numbers, comma-separated, with country code, no +
RECIPIENT_NUMBERS=15551234567,15559876543
# WhatsApp group chat ID, e.g. 120363123456789012@g.us
GROUP_CHAT_ID=120363123456789012@g.us

# Needed to use the /test-whatsapp endpoint
ADMIN_TOKEN=pick-a-long-random-string

# Folder for the WhatsApp login and sent-HR list (default: current folder)
DATA_DIR=.

# Defaults shown; usually no need to set these
CAL_RALEIGH_PLAYER_ID=663728
MARINERS_TEAM_ID=136
POLL_INTERVAL_MS=15000
```

### 3. Start
```bash
npm start
```

### 4. Link WhatsApp
- Open `http://localhost:3000/qr` (or `/qr` on your Railway URL).
- On your phone: WhatsApp → Settings → Linked Devices → Link a Device, and scan the code.
- The login is saved, so you only do this once per machine.

### 5. Get the Group Chat ID
- Start the bot without `GROUP_CHAT_ID` set.
- Send a message in the group. The logs show `Message in group chat 120xxxxx@g.us`.
- Put that ID in `GROUP_CHAT_ID` and restart.

### 6. Test
Send `!cal` in the group, or call the test endpoint:
```bash
curl -X POST http://localhost:3000/test-whatsapp \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Test from Cal Dinger Bot! 🏟️⚾"}'
```

## Deployment to Railway

1. Push to GitHub and create a Railway project from the repo.
2. Add the environment variables above in the Railway dashboard. Set `ADMIN_TOKEN` if you want the test endpoint.
3. Open `/qr` on your Railway URL and scan it.

Railway builds with Nixpacks (`.nixpacks.toml`), checks `/` to confirm the service is up, and always restarts it if it exits.

**Note:** Railway's disk is wiped on every redeploy, which logs WhatsApp out (you'll need to scan `/qr` again) and clears the list of sent home runs. To keep both, attach a Railway volume (e.g. mounted at `/data`) and set `DATA_DIR=/data`.

## API Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | none | Health check: WhatsApp status, chats configured, game being watched, uptime |
| GET | `/qr` | none | WhatsApp login QR code (only shown until linked) |
| POST | `/test-whatsapp` | `x-admin-token` header | Send a test message (`{"message": "..."}`) |

## Project Structure

```
src/server.js      Config, polling loop, HTTP endpoints
src/mlb.js         MLB Stats API calls and live-feed helpers
src/messages.js    Message text and the wager odds
src/whatsapp.js    WhatsApp client and message delivery
test/              Tests (npm test), using Node's built-in test runner
```

## Troubleshooting

- **No messages sent:** Check `GROUP_CHAT_ID` / `RECIPIENT_NUMBERS`. With neither set, the bot only logs what it would send.
- **WhatsApp not ready:** Open `/qr` and scan it.
- **Bot keeps restarting:** Check the logs for "exiting so Railway restarts the service" to see why.

## MLB IDs Used

- **Cal Raleigh:** 663728
- **Seattle Mariners:** 136

## License

MIT License - Feel free to modify for other players/teams!
