# CALBOT Web

The interactive site. Plain HTML/CSS/JS with D3 v7; no heavy framework. See `../docs/PLAN.md` section 8 for the full design, and the root `../CLAUDE.md` for the family overview.

## What's here

Static files, no build step. ES modules, so serve over HTTP (not `file://`).

```
index.html        the page; <meta name="calbot-data"> says where the outputs live (default data/)
css/calbot.css    all styles; colors and fonts as in the design rules below
js/data.js        follows the contract: latest.json (no-cache) -> runs/<run_id>/ files -> events.json;
                  refuses unknown schema numbers; checks the numbers add up (D.problems)
js/app.js         the charts and text; one slider (game state 0..through_game) drives everything
data/             local copy of model outputs, gitignored
```

The first draft (`prototype/`, built in a Claude chat with partly made-up data) was removed at roadmap step 4; see git history.

### Run it locally

```
# from the repo root: publish a model run into web/data/, then serve web/
model/.venv/Scripts/calbot-model run --season 2025 --out web/data
python -m http.server 8765 --directory web
```

`.claude/launch.json` has the same server as "web". `?data=<url>` overrides where the page looks for outputs.

### How the page uses the outputs

- The x-axis is **team games** (162), as in the season log. He sat out 3 (ticks on the season chart); "his game" in the table and caption counts only games he played.
- The slider runs 0..`through_game` of the latest run, so a live season just has a shorter slider.
- The CALBOT chat message is built from `events.json` for that game (home runs, multi-homer games, records, lead changes), the same events the bot announces.
- "Pull a random season" draws a final total from the run's distribution for that game state; only the game-by-game path to it is random filler, and the page says so. No simulation code in the site.
- The season chart's wedge is the run's `percentiles` for that game state: p5 to p95 of simulated final totals (not a standard deviation), with a dashed line to p50. The model only projects the final total, so the wedge is a straight guide from the current game; the numbers at its right edge are the model's, and the sentence under the chart says them in words.
- Time axes are labeled by month (March folds into April); the slider and readouts still count team games.
- The record lines (48, 54, 56, 60, 62) are display constants matching `model/config/records.json`.
- If the season isn't complete, the page re-checks `latest.json` every 5 minutes and shows a "newer run" banner instead of redrawing.
- `window.CALBOT` holds the shaped data, for checking the page against the source in the console.

## Design rules (keep these unless the owner says otherwise)

### Sections

1. **Hero:** giant live home run count; step chart of the season with record lines (Perez 48 catcher, Mantle 54 switch-hitter, Griffey 56 Mariners, the 60 club, Judge 62 AL) that turn yellow when passed; projection wedge from the current game.
2. **The bet:** guesses with live odds, odds-over-time chart, and the CALBOT message the bot would have sent after that game.
3. **Where it could still end:** histogram of simulated final totals, each bar colored by whose guess would win there, with a line at the actual 60.
4. **Pull a random season:** simulates the rest of the season from the chosen game and says how unusual the result is.
5. **Footer:** notes on data, the bet and the model.

One game slider, docked at the bottom, controls every chart; charts can also be scrubbed directly. Include a table view.

### Look

- Bold and specific to the subject, not templated. One memorable element: the scoreboard-yellow home run count beside the step chart.
- Colors: page `#0F3341` (Puget Sound after dark), panels `#0A2530`, rules `#24505F`, text `#EEF3F2` / `#A9C3C8` / `#7A9CA4`, Cal `#FFD23F` (scoreboard bulb yellow).
- Bettor colors, in fixed order (checked for colorblind separation and contrast on `#0F3341`): `#E5564A`, `#2BA696`, `#957BEA`, `#6E9E33`, `#3E8FDD`. Colors follow the person, never their rank.
- Type: Big Shoulders Display (headlines, big numbers), Big Shoulders Text (chart labels, UI), Newsreader (body serif).
- Avoid: all-caps eyebrow labels, middle-dot separators, monospace data labels, identical rounded-card grids, animation the reader didn't ask for (only the Play button moves things). Respect reduced motion.

## Rules

- Read model outputs; never import or copy model code into the site. Odds and distributions come from the model.
- Run files have unique paths and can be cached forever; only `latest.json` gets a short cache time.
- After any data change, check the numbers on the page against the source.
