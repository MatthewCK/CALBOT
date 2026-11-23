# CALBOT plan

The full plan for the CALBOT family of projects, written from planning conversations in Claude chat (Nov 2026). The root `CLAUDE.md` has the short version; this file has the reasoning and details.

All paths below are relative to the repo root (`CALBOT/`):

| Folder | Entity |
|---|---|
| `model/` | CALBOT Model (Python) |
| `contract/` | The output contract (section 3) |
| `web/` | CALBOT Web (prototype in `web/prototype/`) |
| `whatsapp/` | CALBOT WhatsApp (Node, Railway) |
| `docs/` | This plan |

## 1. Why this exists

Two goals, in this order:

1. **A fun project.** Cal Raleigh's 2025 season (60 home runs, the most ever by a catcher or a switch-hitter, plus 5 more in the postseason) and the owner's group-chat bet on his final total.
2. **A portfolio centerpiece** for Silver Bulletin's Associate Interactive Developer job (Nate Silver's site; models include FLIPR for elections and ELWAY for the NFL). What the posting emphasizes, and how CALBOT answers it:

| The posting asks for | CALBOT's answer |
|---|---|
| Interactive graphics and tools tied to models | CALBOT Web |
| Pipelines that carry model output to the site, updating automatically | The model publishes outputs; web, Substack and WhatsApp read them |
| Checking that published numbers are correct | Validation checks, reproducible runs, calibration page |
| Working within Substack on the web, in email and in the app | CALBOT Substack with Datawrapper charts that work as static images in email |
| A feature that lets readers pull a random simulation | "Pull a random season" on the web, "Season of the day" on Substack |
| HTML/CSS/JS, Python/R, Git; BigQuery, SQL, D3, Datawrapper, cloud a plus | The stack below |
| Using AI tools while understanding their limits ("not just a vibecoder") | Keep an honest log of how AI was used |
| Interest in sports and politics analytics | This is the sports piece; a politics project comes separately |

The owner is a backend engineer. Front-end and visualization work is the area to show off most.

## 2. Architecture: one model, several consumers

```
                 MLB Stats API
                      │
              ┌───────▼────────┐
              │  CALBOT Model  │  Python: collects data, simulates, tracks the bet,
              │                │  detects events, publishes outputs
              └───────┬────────┘
                      │  outputs (JSON files, later BigQuery): the contract
        ┌─────────────┼──────────────┬───────────────────┐
        ▼             ▼              ▼                   ▼
  CALBOT Web    CALBOT WhatsApp   Publisher        (future consumers)
  D3 site,      Node bot, fun     pushes data to
  the story     group messages    Datawrapper → Substack
```

### Entities

1. **CALBOT Model** (`model/`): the prediction model and bet tracking. Owns data collection (polling the MLB API), the simulations, the bet logic and event detection. Publishes outputs. Python.
2. **CALBOT Web** (`web/`): interactive charts that tell the story of the season and use the model's outputs. Plain HTML/CSS/JS with D3.
3. **CALBOT WhatsApp** (`whatsapp/`, Node, deployed on Railway): reads the model's outputs and does all the fun group messaging. Its own odds logic moves into the model; the bot becomes purely about voice. It stays usable as a standalone fun project.
4. **Publisher**: a small step after each model run that pushes data to Datawrapper charts and tables embedded in CALBOT Substack posts. No folder yet; likely `model/` or its own `publisher/` when it's built.

Repo layout: decided Nov 2026, one repo with a folder per entity (table at the top). The folders still behave as separate projects: the consumers never import model code, and each has its own language, dependencies and deploy.

### Principles

- **Connect through data, not code.** The web app and the bot read published outputs. One source of truth means the site and WhatsApp never disagree, each piece can use its own language and deploy on its own, and correct outputs imply correct consumers.
- **The bet is data, not code.** Players, guesses, rules (closest wins, ties split) and the stat being bet on live in a config file the model reads. A new season or a second group is a config change, and a general bet builder becomes easy later.
- **Version the contract.** Every output carries a schema version so a format change can't silently break a consumer.
- **Start simple.** The model is a Python package with a CLI that writes JSON files. BigQuery and cloud scheduling come later without changing the contract.

## 3. The output contract

Documented in `contract/README.md`, with JSON Schemas and examples in `contract/schema/` and `contract/examples/`. The layout below is what the model publishes (to a bucket or Pages site, not committed to this repo).

```
outputs/
  runs/<run_id>/            one folder per model run; never changed after it's written
    odds.json               win probability per bettor
    distribution.json       simulated final totals
    season_log.json         game-by-game stats used for this run
    season_of_the_day.json  (when produced) see section 6
  events.json               append-only; each event has an increasing id
  latest.json               pointer to the newest run; written LAST
```

```json
// latest.json
{ "schema": 1, "run_id": "2026-04-14T02-31-07Z", "last_event_id": 412,
  "model_version": "0.3.0", "updated_at": "2026-04-14T02:31:09Z" }
```

Named outputs:
- `season_log`: game-by-game stats.
- `model_runs` / `odds`: one record per run with each bettor's odds, the 5th/50th/95th percentiles and a timestamp.
- `distributions`: simulated final totals per run.
- `events`: home runs, multi-homer games, records passed, lead changes in the bet. The bot reads these to know what to announce.

**Publishing is atomic:** write the run folder first, then `events.json`, then `latest.json` last. A reader following `latest.json` never sees a half-written run.

**Hosting:** GitHub Pages, from a `data` branch, deployed by GitHub Actions together with the site and reachable over HTTPS by every consumer. Section 12 has the details. A cloud storage bucket is the later option.

## 4. How consumers notice updates

### WhatsApp: poll the pointer, keep a cursor

1. Every 30–60 s during games (rarely otherwise), fetch `latest.json`. It's tiny.
2. Compare `last_event_id` with the last id the bot handled, stored somewhere durable (a small file or database row).
3. If higher, read the new events, write and send a message for each, **then** save the new id.
4. If sending fails, don't save the id; the next poll retries.

Delivery is at least once. The bot skips event ids it has already sent, which covers a crash between sending and saving.

### Web: read the latest on page load

- Fetch `latest.json`, then that run's files.
- Run files have unique paths, so they can be cached forever; only `latest.json` gets a short cache time.
- During live games, optionally re-check `latest.json` every few minutes and show a "New: Cal just homered" banner instead of silently redrawing.

### Later: push to wake, pull for data

The model can call a webhook on the bot after publishing ("a new run is ready"). The bot still reads the data from the files; a lost webhook is caught by the regular poll. On GitHub, the publish workflow calls the webhook as its last step (section 12). On Google Cloud this would become Pub/Sub triggered by a bucket upload.

## 5. CALBOT Substack

### What Substack allows

- No custom HTML or JavaScript in posts, so the D3 page, slider, Play button and random-season button can't live there.
- Datawrapper charts, maps and tables can be embedded by pasting their link.
- Embeds are interactive on the web and in the Substack app, but **show as static images in email**. Every chart must make sense as a still image.
- Silver Bulletin works within the same limits: it uses Datawrapper embeds heavily, and some of its model pages say they're designed for the web rather than email or the app.

### How it fits

The publisher (entity 4) runs after each model run:
1. Read `latest.json` and the run files.
2. Reshape data into what each Datawrapper chart needs (odds over time, final-total distribution, standings table, season of the day).
3. Push the data and updated titles to existing Datawrapper charts through its API, then republish. Embedded charts in published posts update without editing the posts.

Posts are written by hand; the charts inside them stay current.

**Known issue to test:** writers report the Substack app sometimes shows stale versions of Datawrapper charts. Put an "updated" timestamp in each chart's notes so stale copies are obvious.

### Dividing the content

| | CALBOT Web | CALBOT Substack |
|---|---|---|
| Role | The full interactive | The story and regular updates |
| Charts | Custom D3: slider, Play, random seasons | Datawrapper: odds over time, distribution, standings, season of the day |
| Email | — | Static images, so chart titles state the takeaway ("Me now has 93% to win") |
| Link | — | Every post links to CALBOT Web |

## 6. Feature: Season of the day

Shows the pipeline running every day in the offseason, and it's the "pull a random simulation" idea from the job posting in a Substack-friendly form.

### What it simulates

A **2027 preseason projection** for Cal, not a replay of 2025. Each day's table is one possible version of the coming season, from the same model that goes live on Opening Day (late March 2027). Once games start, it becomes "a possible rest of the season" with no redesign. Requires Cal's 2026 stats in the prior.

### Reproducible draws

- Each day's simulation is seeded from the date: hash the date string (e.g. first 8 bytes of SHA-256 of `"2026-11-21"`) to get the seed.
- Same date, model version and input data → the identical season. Across dates, draws are independent samples from the distribution.
- Why: no cherry-picking (the seed comes from a fixed rule, so nobody can rerun until a fun season appears), exact debugging of any published run, and web, Substack and the bot can each generate today's season and agree.
- Each published season records **seed, model version and data snapshot**. Changing the code or data changes the output, so "rerun for that date" means rerunning that version on that data.
- Keep every day's season in the outputs as history.

### The Datawrapper table

- **Title (the takeaway, for email):** *Season of the day: Cal hits 41 and Tori wins the pot*
- **Subtitle:** *Nov 21 draw from the 2027 projection. About 1 in 5 simulated seasons end within two of this.*
- **Rows:** months (Mar/Apr–Sep). **Columns:** HR, season total, "Of note."
- **"Of note"** carries the personality: droughts, two-homer games, records passed, lead changes in the bet, written in the bot's voice.
- **Notes line:** model version, run id, "updated daily at 6 a.m. PT."

### Framing strange seasons

Nate Silver's lesson from 538: readers fixate on weird simulated maps and use them to doubt the forecast. So always state how common the day's season is, and lean into rare ones ("Today's season is a 1-in-200 heater").

### Payoff after a few months

CALBOT Web gets a page comparing the histogram of all daily seasons so far with the model's full distribution. If draws are fair, the shapes match, which visibly proves the published draws aren't cherry-picked.

### Wiring

1. Scheduled job each morning (GitHub Actions to start): `calbot-model season-of-the-day --date <today>`.
2. Model writes the season to outputs and updates `latest.json`.
3. Publisher uploads the table data to Datawrapper, updates title and subtitle, republishes.
4. The embedded table in the Substack post updates itself. Optionally the bot posts it to the group.

Check that Datawrapper's API on the owner's plan allows updating data, titles and republishing before building step 3.

## 7. The model

### Current (prototype, in `web/prototype/build_data.py`)

- Per-game home run rate with a Gamma prior from his 2024 rate (34 HR in 153 games), weighted as 150 games of evidence, updated after every game.
- Each simulation draws a rate from the posterior, then plays out remaining games as Poisson draws. 20,000 simulations per game state.
- Bet: closest guess to the final total wins; ties split.

### Later

- FLIPR-style versions with a toggle on every chart: **Lite** (season rate only), **Classic** (blended with preseason projections, regressed toward career rate), **Deluxe** (plus remaining schedule, ballparks, opposing pitchers and playing time).
- Backtest and calibration: run the model on past seasons' home run leaders and plot predicted against actual.

## 8. CALBOT Web: page design

### Sections

1. **Hero:** giant live home run count; step chart of the season with record lines (Perez 48 catcher, Mantle 54 switch-hitter, Griffey 56 Mariners, the 60 club, Judge 62 AL) that turn yellow when passed; projection wedge from the current game.
2. **The bet:** guesses with live odds, odds-over-time chart, and the CALBOT message the bot would have sent after that game.
3. **Where it could still end:** histogram of simulated final totals, each bar colored by whose guess would win there, with a line at the actual 60.
4. **Pull a random season:** simulates the rest of the season from the chosen game and says how unusual the result is.
5. **Footer:** notes on data, the bet and the model.

One game slider, docked at the bottom, controls every chart; charts can also be scrubbed directly. Includes a table view.

### Look

- Bold and specific to the subject, not templated. One memorable element: the scoreboard-yellow home run count beside the step chart.
- Colors: page `#0F3341`, panels `#0A2530`, rules `#24505F`, text `#EEF3F2` / `#A9C3C8` / `#7A9CA4`, Cal `#FFD23F`.
- Bettor colors, in fixed order (checked for colorblind separation and contrast on `#0F3341`): `#E5564A`, `#2BA696`, `#957BEA`, `#6E9E33`, `#3E8FDD`. Colors follow the person, never their rank.
- Type: Big Shoulders Display (headlines, big numbers), Big Shoulders Text (chart labels, UI), Newsreader (body serif).
- Avoid: all-caps eyebrow labels, middle-dot separators, monospace data labels, identical rounded-card grids, animation the reader didn't ask for (only the Play button moves things). Respect reduced motion.

### Later ideas

- FLIPR-style model toggle.
- Bet builder: any player, any stat, any line.
- "What does he need?" slider.
- Home run race leaderboard with uncertainty ranges.
- Backtest/calibration page and the season-of-the-day histogram page.
- Pipeline status page: last successful run, checks passed, API latency.
- Methodology article in Silver Bulletin's plain, slightly funny style.
- Name backronym: "Cumulative Accounting of Long Balls, Over Time" (in the prototype); alternatives welcome.

## 9. Stack

| Need | Choice |
|---|---|
| Model, data, simulations | Python |
| Store game logs and every model run | JSON files on the `data` branch; BigQuery (free tier) loaded by each run, queried with SQL |
| Scheduling | GitHub Actions (section 12); Cloud Scheduler + Cloud Run Jobs only if it outgrows that |
| Hosting (site and outputs) | GitHub Pages, one origin |
| Web front end | HTML/CSS/JS + D3, no heavy framework |
| Substack charts | Datawrapper via its API |
| WhatsApp bot | Existing Node app on Railway |
| Version control | Git, clean commits, CI running data checks that block a bad publish |
| Optional | Redo the calibration analysis in R to show range |

## 10. Roadmap

1. **Real data.** Replace the prototype's placeholder data (`web/prototype/season.json`) with the real 2025 game log (`https://statsapi.mlb.com/api/v1/people/663728/stats?stats=gameLog&season=2025&group=hitting`). Check it totals 60 and matches the known milestones.
2. **Real bet.** Replace the stand-in bettors with the group's real names and guesses (or keep stand-ins if the owner prefers privacy).
3. **Model package.** Extract the model from `web/prototype/build_data.py` into the Python package in `model/`, with a CLI and the output contract in `contract/`. Add tests and data checks.
4. **CALBOT Web from outputs.** Turn `web/prototype/` into proper project files in `web/` that read the published outputs.
   **4b. Deploy.** Publish workflow on GitHub Actions to GitHub Pages, with checks that block a bad publish and a pipeline status page (section 12). BigQuery load step soon after.
5. **Season of the day.** Add Cal's 2026 stats, the 2027 projection, seeded daily draws, history, and the scheduled job.
6. **Publisher + Substack.** Datawrapper table for season of the day, then odds and distribution charts. Start the Substack.
7. **Bot migration.** Point CALBOT WhatsApp (`whatsapp/`) at the outputs and remove its own odds logic.
8. **Apply.** Once 1–4 and 4b are solid and live (roughly two weeks), send the application with a link, a short note on the owner's role, and how AI tools were used.
9. **Opening Day 2027.** Go live for the season; a natural reason to follow up with Silver Bulletin.

Open decision: stay focused on Cal and the bet, or build a general home run race and bet builder with Cal as the default view.

## 11. Data honesty notes

- Prototype data: monthly totals and milestones are real (first HR Mar 31 in game 5; 26 through game 63; 32 through game 77; 38 at the All-Star break; 48 and 49 on Aug 24; 59 and 60 on Sep 24; 60 final). Which game each other home run fell on, and the game dates, are approximate. Bettors and guesses are invented.
- After every data change, verify the numbers against the source. Accuracy is part of the pitch.
- Keep an honest log of how AI tools were used, in commits or a notes file.

## 12. Deployment: GitHub and Railway

Decided Nov 2026. Everything runs on free or already-paid services: GitHub Actions and GitHub Pages (free because the repo is public) and the bot's existing Railway service.

### Why not GCP (yet)

For the application, this setup is better, not only cheaper. Reviewers can't see a Cloud Run job, but on a public repo they can see everything:
- The **Actions tab** shows every scheduled run, its logs and its checks. That shows "model output flows into the site automatically" instead of just claiming it.
- The **`data` branch** is a commit history of every number ever published, with diffs. That's an audit trail for "checking that published numbers are correct".
- The **workflow file** is short enough to read in a minute.

GCP would add a monthly bill and setup time, and it would hide the pipeline behind a console nobody outside can open. The posting lists cloud as a plus. BigQuery on its free tier covers that (below), and the README can explain how this maps to Cloud Scheduler + Cloud Run Jobs + Cloud Storage in one paragraph.

### Shape

```
GitHub Actions (schedule + manual trigger)        GitHub Pages (one site, one origin)
  1. run calbot-model --out <data folder>           /              <- web/
  2. run checks; any failure stops here             /data/...      <- the data branch
  3. commit outputs to the `data` branch     --->        ^                ^
  4. deploy web/ + data/ to Pages                        |                |
  5. load the run into BigQuery                    browser reads    bot reads over HTTPS
  6. push to Datawrapper (publisher)                                      |
  7. POST {run_id} to the bot's webhook  --->  Railway: CALBOT WhatsApp --+
```

- **The model isn't a server.** It's a batch job: it runs, writes files and exits. `--out` points at a checkout of the `data` branch instead of `web/data/`.
- **Site and data share an origin,** so there's no CORS setup, and the default `<meta name="calbot-data">` (`data/`) works as is.
- **The bot stays on Railway** and reads the Pages URLs. Its Express server gets a small authenticated `/new-run` endpoint. The regular poll (section 4) still catches a lost webhook.

### The `data` branch

A Pages deploy replaces the whole site, so old `runs/<run_id>/` folders would disappear. An orphan `data` branch keeps every published run. Each workflow run checks it out, adds the new run, commits and deploys `web/` plus that folder. Run folders are small JSON files. Old ones can be pruned later if the branch grows.

### Checks block the publish

The workflow runs checks before it deploys, and any failure stops the publish. Bad numbers never go live, and the failed run stays visible in the Actions tab. To start with:
- The season total and milestones match the game log (`known_facts.json`).
- Each distribution sums to 1, and percentiles are in order (p5 <= p50 <= p95).
- Odds across bettors sum to 1.
- Season home runs never go down, and `through_game` never goes backwards between runs.
- Every output validates against its schema in `contract/`.

### What GitHub can't do, and what that means

- **Cache headers:** Pages sends `max-age=600` on everything, so `latest.json` can be up to 10 minutes stale. That's fine for a model that updates after each game. The webhook carries the `run_id`, and `runs/<run_id>/` is a brand-new URL, so the bot never reads stale run files.
- **Atomic publishing:** a Pages deploy switches the whole site at once. The ordering rule in section 3 (`latest.json` last) still holds for the commits to the `data` branch and matters again if publishing moves to a bucket.
- **Schedule accuracy:** cron is in UTC, runs every 5 minutes at most, and is often 5–20 minutes late. During the season, run every 20–30 minutes in the evening (Pacific time), plus a morning run for season of the day. Say so on the status page.
- **The 60-day rule:** GitHub turns off scheduled workflows in a public repo after 60 days with no commits to the default branch. Commits to the `data` branch may not count. Re-enable the workflow before Opening Day, or keep a commit to `main` landing every couple of months.

### BigQuery for run history (free tier)

Each run also loads its odds, percentiles and distribution into BigQuery: 10 GB of storage and 1 TB of queries a month are free. A service-account key is stored as an Actions secret. The calibration and backtest pages are built from SQL queries on that table. This moves "BigQuery + SQL later" earlier, because it's the cheapest way to show those skills with no infrastructure to run.

### Pipeline status page

A page on CALBOT Web, built from a small `status.json` the workflow writes: last run time, model version, checks passed, and links to that Actions run and the `data` commit. It turns the plumbing into something a reviewer can click.

### Secrets (GitHub repo secrets, never committed)

- `BOT_WEBHOOK_URL`, `BOT_WEBHOOK_SECRET`
- `GCP_SA_KEY` (BigQuery)
- `DATAWRAPPER_TOKEN`

### Setup steps

1. `.github/workflows/publish.yml`: schedule + `workflow_dispatch`; set up Python, install `model/`, run, check, commit to `data`, deploy Pages.
2. In the GitHub UI, once: Settings → Pages → Source: GitHub Actions.
3. Add the status page and `status.json`.
4. Add the BigQuery load step.
5. Add the bot's `/new-run` endpoint and the webhook step (with roadmap step 7).
6. Add the Datawrapper step (with roadmap step 6).
