# CALBOT Model

The Python model: collects data from the MLB Stats API, runs the simulations, tracks the bet, detects events, and publishes the outputs described in `../contract/`. See `../docs/PLAN.md` sections 2, 3, 6 and 7, and the root `../CLAUDE.md`.

**State:** v0.1.0. Real 2025 data from the MLB API, the "Lite" model, bet scoring, events and atomic publishing all work and are tested. Bettors are still the prototype's stand-ins (roadmap step 2). Season of the day isn't built yet.

## Layout

```
pyproject.toml            package calbot-model, CLI entry point calbot-model
config/
  bet_2025.json           the bet: player, team, stat, rule, bettors (data, not code)
  records.json            marks that trigger "record" events (Perez 48, Mantle 54, ...)
data/2025/
  season_log.json         saved MLB API data in the contract's season_log format (committed snapshot)
  prior.json              2024 totals that set the prior
  known_facts.json        facts from reporting, checked against the API data
src/calbot_model/
  mlb.py                  API URLs and fetching
  season.py               API responses -> season log (one row per team game) and prior
  checks.py               invariants + known facts
  model.py                game states, seed rule, simulation, percentiles, histogram
  bet.py                  load the bet config, closest-wins-ties-split scoring
  events.py               home runs, multi-homer games, records, lead changes
  run.py                  one run: every game state through the current one
  publish.py              contract layout, atomic writes, append-only events
  cli.py                  fetch / check / run
tests/                    pytest; validates outputs against ../contract/schema
```

## Working here

Run from this folder (Python 3.11+):

```
python -m venv .venv
.venv\Scripts\activate        # Windows; source .venv/bin/activate elsewhere
pip install -e ".[dev]"
pytest

calbot-model fetch --season 2025          # MLB API -> data/2025/, refuses to save if checks fail
calbot-model check --season 2025
calbot-model run --season 2025 --out outputs [--through-game 97] [--simulations 20000]
```

`outputs/` is gitignored; outputs get published elsewhere (PLAN.md section 3).

## The model ("Lite")

- One row per **team** game. Cal sat out 3 of the Mariners' 162 games in 2025 (team games 64, 86, 102), so "his game 77" is team game 78. The milestones in reporting count his games.
- HR per game played ~ Gamma posterior, prior mean 34/153 (2024), weight 150 games (as in the prototype).
- Share of team games he plays ~ Beta posterior, prior mean 153/162, weight 162 team games. This is new compared with the prototype, which assumed he played every game.
- Each simulation: draw rate and share, games left ~ Binomial, home runs ~ Poisson. 20,000 per game state.
- Seed per game state: first 8 bytes of SHA-256 of `"<season>:<through_game>"`. Same data and version give identical outputs.

## Rules

- The outputs must match `../contract/`. Change the contract first, then the code. Tests validate against the schemas.
- Publishing is atomic: run folder, then `events.json`, then `latest.json` last. Each file is written to a temp name and renamed.
- Events have stable keys; a rerun never republishes or renumbers an event.
- The bet (players, guesses, rules, stat) is a config file the model reads, not code.
- Seeded draws (season of the day): the seed comes from the date by a fixed rule; record seed, model version and data snapshot (`data_hash`) with every published season.
- Add data checks with every data change (`data/<season>/known_facts.json`).
- Consumers never import this package. Don't add code here that `web/` or `whatsapp/` would call directly.

## Known gaps

- Lead-change events follow the favorite game by game, so close races flip a lot (7 changes between Big Mike and Me in April and May 2025). The bot may want a margin before announcing.
- Odds and distribution files carry the full history of game states; about 75 KB together for a full season. Fine for now.
