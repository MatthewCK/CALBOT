# CALBOT Model

The Python model: collects data from the MLB Stats API, runs the simulations, tracks the bet, detects events, and publishes the outputs described in `../contract/`. See `../docs/PLAN.md` sections 2, 3, 6 and 7, and the root `../CLAUDE.md`.

**State:** empty skeleton. No model code yet. The working prototype model lives in `../web/prototype/build_data.py`; roadmap step 3 moves it here.

## Layout

```
pyproject.toml          package calbot-model, CLI entry point calbot-model
src/calbot_model/       the package (src layout)
  cli.py                CLI stub
tests/                  pytest
```

## Working here

Run from this folder (Python 3.11+):

```
python -m venv .venv
.venv\Scripts\activate        # Windows; source .venv/bin/activate elsewhere
pip install -e ".[dev]"
pytest
```

## Rules

- The outputs must match `../contract/`. Change the contract first, then the code.
- Publishing is atomic: run folder, then `events.json`, then `latest.json` last.
- The bet (players, guesses, rules, stat) is a config file the model reads, not code.
- Seeded draws (season of the day): the seed comes from the date by a fixed rule; record seed, model version and data snapshot with every published season.
- Add data checks with every data change (for 2025: total is 60 and the known milestones line up).
- Consumers never import this package. Don't add code here that `web/` or `whatsapp/` would call directly.
