# CALBOT output contract

The format the model publishes and every consumer (`web/`, `whatsapp/`, the publisher) reads. Consumers depend on this folder, never on `model/` code. Background and reasoning: `../docs/PLAN.md` sections 2–4.

**Status:** schema version 1. `latest`, `odds`, `distribution`, `season_log` and `events` have real schemas, and the model's tests validate its outputs against them. `season_of_the_day` comes with roadmap step 5.

## Layout

```
outputs/
  runs/<run_id>/            one folder per model run; never changed after it's written
    odds.json               win probability per bettor
    distribution.json       simulated final totals
    season_log.json         game-by-game stats used for this run
    season_of_the_day.json  (when produced) PLAN.md section 6
  events.json               append-only; each event has an increasing id
  latest.json               pointer to the newest run; written LAST
```

`run_id` is a UTC timestamp safe for paths, e.g. `2026-04-14T02-31-07Z`.

Outputs are published to hosting reachable over HTTPS (a cloud storage bucket, or GitHub Pages for the web side). They aren't committed to this repo.

## Files

### `latest.json`

The pointer. Tiny, short cache time, and the only file consumers poll.

```json
{ "schema": 1, "run_id": "2026-04-14T02-31-07Z", "last_event_id": 412,
  "model_version": "0.3.0", "updated_at": "2026-04-14T02:31:09Z" }
```

### `runs/<run_id>/odds.json`

One record per run: each bettor's chance to win, the 5th/50th/95th percentiles of the final total, and a timestamp.

### `runs/<run_id>/distribution.json`

Simulated final totals for the run (a histogram: share of simulations ending on each total).

### `runs/<run_id>/season_log.json`

The game-by-game stats the run used.

### `runs/<run_id>/season_of_the_day.json`

When produced: one simulated season seeded from the date, with the seed, model version and data snapshot it came from.

### `events.json`

Append-only list of things worth announcing: home runs, multi-homer games, records passed, lead changes in the bet. Each event has an `id` that only increases.

## Rules

- **Every file carries `"schema": <n>`.** A consumer that sees a schema number it doesn't know stops and logs, rather than guessing.
- **Publishing is atomic:** write the run folder first, then `events.json`, then `latest.json` last. A reader following `latest.json` never sees a half-written run.
- **Run folders are immutable.** Their paths are unique, so they can be cached forever.
- **Events are delivered at least once.** Consumers keep a cursor (`last_event_id` they've handled), save it only after acting, and skip ids they've already handled.
- **Changing the contract:** edit the schema here first, bump `schema` for anything that isn't backwards compatible, then update the model, then the consumers.

## Folders

- `schema/`: JSON Schema (draft 2020-12) for each file.
- `examples/`: example files that should validate against the schemas.
