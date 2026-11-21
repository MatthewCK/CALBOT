# CALBOT Web

The interactive site. Plain HTML/CSS/JS with D3 v7; no heavy framework. See `../docs/PLAN.md` section 8 for the full design, and the root `../CLAUDE.md` for the family overview.

## What's here

`prototype/` is the first draft, built in a Claude chat and published as a private claude.ai page called "CALBOT: Sixty".

- `prototype/template.html`: the page with a `__DATA__` placeholder.
- `prototype/index.html`: the built single-file page (D3 v7 from cdnjs, Google Fonts, `season.json` inlined in place of `__DATA__`).
- `prototype/build_data.py`: builds `season.json` (series, odds, simulated distributions). Run it from inside `prototype/`; it writes `season.json` to the current folder. Needs `numpy`.
- `prototype/season.json`: **placeholder data** (see the root `CLAUDE.md`).

The step that inlines `season.json` into `template.html` to make `index.html` isn't in the repo yet; it was done in the chat. Add a small build script before changing the data.

Roadmap step 4 turns this into proper project files that fetch `latest.json` and the run files described in `../contract/` instead of inlining data. Until then, don't restructure the prototype beyond what a task needs.

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
