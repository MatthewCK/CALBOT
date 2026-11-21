"""One model run: simulate every game state through the current one and build the run files."""

from datetime import datetime, timezone

import numpy as np

from . import __version__, bet as bet_mod, events as events_mod, model

SCHEMA = 1


def new_run_id(now: datetime | None = None) -> str:
    return (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H-%M-%SZ")


def compute(season_log: dict, prior: dict, bet: dict, records: list[dict], *, through_game: int | None = None,
            simulations: int = model.DEFAULT_SIMULATIONS, run_id: str | None = None,
            now: datetime | None = None) -> dict:
    """Returns {"odds", "distribution", "season_log", "events"} (events without ids)."""
    now = now or datetime.now(timezone.utc)
    run_id = run_id or new_run_id(now)
    p = model.Prior.from_season(prior)
    guesses = [b["guess"] for b in bet["bettors"]]
    season = season_log["season"]

    odds_hist, dist_hist = [], []
    for state in model.game_states(season_log, through_game):
        rng = np.random.default_rng(model.seed_for(season, state.through_game))
        finals = model.simulate(state, p, simulations, rng)
        start, probs = model.histogram(finals)
        odds_hist.append({
            "through_game": state.through_game,
            "hr": state.hr,
            "win_prob": [round(x, 5) for x in bet_mod.win_probs(finals, guesses)],
            "percentiles": model.percentiles(finals),
        })
        dist_hist.append({"through_game": state.through_game, "start": start, "probs": probs})

    cur, cur_dist = odds_hist[-1], dist_hist[-1]
    common = {"schema": SCHEMA, "run_id": run_id, "model_version": __version__}
    odds = {
        **common,
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "season": season,
        "through_game": cur["through_game"],
        "hr": cur["hr"],
        "simulations": simulations,
        "bet": {"stat": bet["stat"], "rule": bet["rule"]},
        "bettors": [{"name": b["name"], "guess": b["guess"], "win_prob": w} for b, w in zip(bet["bettors"], cur["win_prob"])],
        "percentiles": cur["percentiles"],
        "history": odds_hist,
    }
    distribution = {
        **common,
        "season": season,
        "through_game": cur["through_game"],
        "simulations": simulations,
        "start": cur_dist["start"],
        "probs": cur_dist["probs"],
        "history": dist_hist,
    }
    events = events_mod.detect(season_log, odds_hist, bet["bettors"], records)
    for e in events:
        e["run_id"] = run_id
    return {"odds": odds, "distribution": distribution, "season_log": season_log, "events": events}
