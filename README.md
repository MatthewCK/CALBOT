# CALBOT - MLB Home Run Alerts for WhatsApp

A WhatsApp bot that messages your group chat the moment your favorite player hits a home run. 🏟️⚾

It was built to follow Cal Raleigh of the Seattle Mariners. Point it at any MLB player in your `.env` file.

```
🚨🚨🚨 CAL DINGER! 🚨🚨🚨
Cal Raleigh homers (60) on a fly ball to right center field. ⚾💥
Bottom 5 • 2 RBI 🏃‍♂️
EV 107.3 mph • LA 28° • 412 ft 🚀

🏆 Season HR #60

📊 COL 3 - SEA 7
🏟️ Cal: 2/3 • 3 RBI • 1 R
```

## Features

- **Home run alerts:** the play description, inning, RBIs, exit velocity, launch angle, distance, season HR number, score and the player's line for the game.
- **Status command:** anyone in the chat can send `!cal` (configurable) to check the bot is awake. It replies with the score, the player's line today and when he's up next ("on deck", "in the hole", "up after 4 more batters"). Before a game it gives the start time and lineup spot, and between games it gives the next game.
- **Optional wager:** settle a friendly bet on the player's season home run total. Every alert includes each person's odds of winning, projected from his current pace.
- **Runs itself:** sleeps between games, follows regular-season and postseason games (doubleheaders included), and never sends the same home run twice, even after a restart.

Only home run alerts and replies to the status command go to WhatsApp. The console log also shows game status changes, when the player comes up to bat, and how each at-bat ended, for diagnostics.

## How It Works

1. **Find the next game:** Checks the [MLB Stats API](https://statsapi.mlb.com) schedule for the team's next regular-season or postseason game, then sleeps until 5 minutes before first pitch.
2. **Watch it:** Polls the live game feed every 15 seconds until the game is final, postponed or suspended, then looks for the next game.
3. **Spot home runs:** Any completed play with event type `home_run` and the configured player as the batter.
4. **Send the alert** through [whatsapp-web.js](https://wwebjs.dev/), which runs WhatsApp Web in a hidden Chrome browser and is linked to your WhatsApp account like any other linked device.
5. **No repeats:** Sent home runs are saved to `.calbot-sent.json` in `DATA_DIR`. If that file is lost (e.g. a redeploy without a volume), home runs that ended more than 10 minutes before the bot first looks at a game are treated as already sent.

If the WhatsApp connection drops, the process exits and your host restarts it. The saved login lets it reconnect without a new QR scan.

The MLB Stats API is free and needs no key.

> **Heads up:** whatsapp-web.js isn't an official WhatsApp API. WhatsApp could limit or ban accounts that use automation, so consider linking a spare number instead of your main one.

## Quick Start

You'll need Node.js 18 or later and a WhatsApp account.

```bash
git clone https://github.com/MatthewCK/CALBOT.git
cd CALBOT
npm install
cp .env.example .env    # then edit .env
npm start
```

1. **Link WhatsApp:** open http://localhost:3000/qr and scan the code from WhatsApp → Settings → Linked Devices → Link a Device.
2. **Find your group chat ID:** with `GROUP_CHAT_ID` blank, send any message in the group. The log shows `Message in group chat 120xxxxx@g.us`. Put that in `GROUP_CHAT_ID` and restart.
3. **Test it:** send `!cal` in the group. The bot should reply.

## Configuration

All settings live in `.env` (see [`.env.example`](.env.example)). On Railway or another host, set them as environment variables.

| Variable | Default | What it does |
|---|---|---|
| `PLAYER_ID` | `663728` (Cal Raleigh) | MLB player to follow: the number at the end of his mlb.com URL |
| `TEAM_ID` | `136` (Mariners) | The player's team (see the table below) |
| `PLAYER_NAME` | `Cal` | Name used in messages ("CAL DINGER!", "Cal is on deck") |
| `TIMEZONE` | `America/Los_Angeles` | Time zone for game times in messages |
| `GROUP_CHAT_ID` | | WhatsApp group to send to (`...@g.us`) |
| `RECIPIENT_NUMBERS` | | Phone numbers to message directly: comma-separated, country code, no `+` |
| `COMMAND` | `!cal` | Status command (not case-sensitive) |
| `WAGER_PICKS` | off | `Name:pick,pick;Name:pick,...` (see [Wager](#wager)) |
| `DATA_DIR` | `.` | Where the WhatsApp login and sent-alert list are stored |
| `POLL_INTERVAL_MS` | `15000` | How often to check the live game |
| `PORT` | `3000` | HTTP port |

Set at least one of `GROUP_CHAT_ID` or `RECIPIENT_NUMBERS`. With neither, the bot only logs what it would send. The status command only answers in these chats.

### Team IDs

| Team | ID | Team | ID | Team | ID |
|---|---|---|---|---|---|
| Angels | 108 | Dodgers | 119 | Rays | 139 |
| Diamondbacks | 109 | Nationals | 120 | Rangers | 140 |
| Orioles | 110 | Mets | 121 | Blue Jays | 141 |
| Red Sox | 111 | Athletics | 133 | Twins | 142 |
| Cubs | 112 | Pirates | 134 | Phillies | 143 |
| Reds | 113 | Padres | 135 | Braves | 144 |
| Guardians | 114 | Mariners | 136 | White Sox | 145 |
| Rockies | 115 | Giants | 137 | Marlins | 146 |
| Tigers | 116 | Cardinals | 138 | Yankees | 147 |
| Astros | 117 | | | Brewers | 158 |
| Royals | 118 | | | | |

### Wager

Set `WAGER_PICKS` to give each person a few possible final regular-season home run totals:

```
WAGER_PICKS=Tim:54,55,56,60;Austin:53,57,58,59;Matt:61,62,63,64
```

Home run alerts and status replies then end with each person's odds of winning, best first:

```
🎯 WAGER UPDATE
Current: 38 HR
Projection: 51 HR

🥇 Tim: 19%
   (54,55,56,60)
🥈 Austin: 16% 🎯
   (53,57,58,59)
🥉 Matt: <1%
   (61,62,63,64)
❌ No Winner: 64%
```

The projection uses the player's home runs per team game so far, times the team's games left. The home runs still to come are modeled as a Poisson distribution, so the odds narrow as the season goes on and settle on the winner after game 162. 🎯 marks picks within 2 of the projection. Leave `WAGER_PICKS` blank to turn this off.

## Deploying to Railway

The repo includes Railway config (`railway.json`, `.nixpacks.toml`): it builds with Nixpacks, checks `/` to confirm the service is up, and always restarts it if it exits.

1. Fork this repo and create a Railway project from it.
2. Add your settings as service variables.
3. **Add a volume** (e.g. mounted at `/data`) and set `DATA_DIR=/data`. Without it, every redeploy logs WhatsApp out and forgets which home runs were sent.
4. Open `/qr` on your Railway URL and scan it.

It should run anywhere that can run Node and headless Chrome. The service is meant to run during the season and be shut down in the offseason.

## HTTP Endpoints

| Path | Purpose |
|---|---|
| `GET /` | Health check: WhatsApp status, chats configured, game being watched, uptime |
| `GET /qr` | WhatsApp login QR code (only shown until linked) |

Both are open: the health check shows only status, and the QR code disappears once WhatsApp is linked, so scan it right after you deploy. To test sending, use the status command in the chat.

## Project Structure

```
src/server.js      Polling loop, HTTP endpoints, startup
src/config.js      Reads all settings from the environment
src/mlb.js         MLB Stats API calls and live-feed helpers
src/messages.js    Message text and wager odds
src/whatsapp.js    WhatsApp client, delivery and the status command
test/              Tests (npm test), using Node's built-in test runner
```

## Troubleshooting

- **No messages sent:** check `GROUP_CHAT_ID` / `RECIPIENT_NUMBERS`.
- **WhatsApp not ready:** open `/qr` and scan it.
- **Status command gets no reply:** it only answers in the configured chats, at most once every 10 seconds per chat.
- **Bot keeps restarting:** look in the logs for "exiting so Railway restarts the service" to see why.

## License

[MIT](LICENSE)
