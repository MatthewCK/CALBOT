# CALBOT WhatsApp

The group-chat bot: polls the MLB API during Mariners games and sends a WhatsApp message when Cal homers, with the bet standings. Node (>= 18), Express, whatsapp-web.js (headless Chrome). `README.md` here is the public, user-facing guide; keep it accurate. See the root `../CLAUDE.md` for the family overview.

This folder was brought in from the standalone `MatthewCK/CALBOT` repo with `git subtree add`, so its history is intact. Commits before the merge refer to paths without the `whatsapp/` prefix.

## Working here

Run everything from this folder:

```
npm ci
npm test      # Node's built-in test runner, test/calbot.test.js
npm start     # node src/server.js
```

- Code: `src/server.js` (entry, polling loop, HTTP endpoints `/` and `/qr`), `src/mlb.js` (MLB API), `src/messages.js` (message text), `src/whatsapp.js` (client), `src/config.js` (env vars).
- Settings come from environment variables; locally from `.env` (copy `.env.example`). `.env` holds real chat IDs and phone numbers: never commit it, never print it.
- Tests set their own env vars, so they don't depend on `.env`.

## Railway

- Deployed on Railway from GitHub. In the monorepo the service's **Root Directory must be `/whatsapp`**, and the config file path must be set to `/whatsapp/railway.json` (Railway doesn't look for the config inside the root directory on its own).
- `railway.json`: Nixpacks build, start `node src/server.js`, health check `/`, restart always. `.nixpacks.toml` pins Node 18 and runs `npm install`. Both use paths relative to this folder, so they work unchanged once the root directory is set.
- A volume mounted at `/data` with `DATA_DIR=/data` keeps the WhatsApp login (`.wwebjs_auth/`) and the sent-alert list (`.calbot-sent.json`) across redeploys. Without it, every redeploy logs WhatsApp out.
- Don't change Railway settings or redeploy without the owner asking.

## Where it's headed

Roadmap step 7 (PLAN.md section 4): the bot stops computing odds itself and reads the model's published outputs instead: poll `latest.json`, keep a cursor on `last_event_id`, send a message per new event, then save the cursor. The bot becomes purely about voice. It should stay usable as a standalone project for people who just want home run alerts.
