"""Data checks. Run after every fetch, before any run publishes.

Two kinds:
- invariants: things that must hold for any season log (cumulative totals add up, etc.)
- known facts: hand-entered from reporting (data/<season>/known_facts.json), checked against the API data
"""

import json
from pathlib import Path

from .season import data_hash


def invariants(log: dict) -> list[str]:
    errors = []
    games = log["games"]
    if log["team_games"] != len(games):
        errors.append(f"team_games is {log['team_games']} but there are {len(games)} rows")
    if log["data_hash"] != data_hash(games):
        errors.append("data_hash does not match the games")
    if len({g["game_pk"] for g in games}) != len(games):
        errors.append("duplicate game_pk")
    cum = pg = 0
    prev_date = ""
    seen_unfinished = False
    for i, g in enumerate(games, 1):
        where = f"team game {i}"
        if g["team_game"] != i:
            errors.append(f"{where}: team_game is {g['team_game']}")
        if g["date"] < prev_date:
            errors.append(f"{where}: date {g['date']} is before {prev_date}")
        prev_date = g["date"]
        if g["final"] and seen_unfinished:
            errors.append(f"{where}: final game after an unfinished one")
        seen_unfinished |= not g["final"]
        if g["played"]:
            pg += 1
            if g["player_game"] != pg:
                errors.append(f"{where}: player_game is {g['player_game']}, expected {pg}")
        else:
            if g["player_game"] is not None or g["hr"] or g["pa"]:
                errors.append(f"{where}: sat out but has player_game, hr or pa")
        if g["hr"] > g["pa"]:
            errors.append(f"{where}: more home runs than plate appearances")
        cum += g["hr"]
        if g["cum_hr"] != cum:
            errors.append(f"{where}: cum_hr is {g['cum_hr']}, expected {cum}")
    return errors


def _by_player_game(games, n):
    for g in games:
        if g["player_game"] == n:
            return g
    return None


def known_facts(log: dict, prior: dict, facts: dict) -> list[str]:
    errors = []
    games = log["games"]
    total = games[-1]["cum_hr"] if games else 0
    played = sum(g["played"] for g in games)

    for f in facts["checks"]:
        t = f["type"]
        if t == "season_total":
            if total != f["hr"]:
                errors.append(f"season total is {total}, expected {f['hr']}")
        elif t == "games_played":
            if played != f["games"]:
                errors.append(f"games played is {played}, expected {f['games']}")
        elif t == "first_hr":
            first = next((g for g in games if g["hr"]), None)
            got = (first["date"], first["player_game"]) if first else None
            if got != (f["date"], f["player_game"]):
                errors.append(f"first home run is {got}, expected {(f['date'], f['player_game'])}")
        elif t == "through_player_game":
            g = _by_player_game(games, f["player_game"])
            got = g["cum_hr"] if g else None
            if got != f["cum_hr"]:
                errors.append(f"through his game {f['player_game']}: {got} HR, expected {f['cum_hr']}")
        elif t == "through_date":
            before = [g for g in games if g["date"] <= f["date"]]
            got = before[-1]["cum_hr"] if before else 0
            if got != f["cum_hr"]:
                errors.append(f"through {f['date']}: {got} HR, expected {f['cum_hr']}")
        elif t == "on_date":
            day = [g for g in games if g["date"] == f["date"]]
            got = (sum(g["hr"] for g in day), day[-1]["cum_hr"] if day else None)
            if got != (f["hr"], f["cum_hr"]):
                errors.append(f"on {f['date']}: (hr, total) is {got}, expected {(f['hr'], f['cum_hr'])}")
        elif t == "prior":
            got = (prior["season"], prior["hr"], prior["games_played"], prior["team_games"])
            want = (f["season"], f["hr"], f["games_played"], f["team_games"])
            if got != want:
                errors.append(f"prior (season, hr, games, team games) is {got}, expected {want}")
        else:
            errors.append(f"unknown check type {t!r}")
    return errors


def run_all(log: dict, prior: dict, facts_path: Path | None) -> list[str]:
    errors = invariants(log)
    if facts_path and Path(facts_path).exists():
        errors += known_facts(log, prior, json.loads(Path(facts_path).read_text(encoding="utf-8")))
    return errors
