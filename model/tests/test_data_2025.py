"""The saved 2025 data (from the MLB API) against invariants and the facts from reporting."""

import copy

from calbot_model import checks
from calbot_model.season import data_hash

from conftest import MODEL, read


def test_2025_passes_all_checks(log2025, prior2025):
    assert checks.run_all(log2025, prior2025, MODEL / "data" / "2025" / "known_facts.json") == []


def test_2025_headline_numbers(log2025, prior2025):
    games = log2025["games"]
    assert len(games) == 162
    assert games[-1]["cum_hr"] == 60
    assert sum(g["played"] for g in games) == 159
    assert (prior2025["hr"], prior2025["games_played"]) == (34, 153)


def test_2025_matches_contract(log2025, validate):
    validate("season_log", log2025)


def test_checks_catch_a_changed_total(log2025, prior2025):
    bad = copy.deepcopy(log2025)
    bad["games"][100]["hr"] += 1
    errors = checks.invariants(bad)
    assert any("cum_hr" in e for e in errors)
    assert any("data_hash" in e for e in errors)


def test_known_facts_catch_a_moved_homer(log2025, prior2025):
    # Move the Sep 24 pair to the next day: totals still add up, but the facts don't.
    bad = copy.deepcopy(log2025)
    games = bad["games"]
    i = next(i for i, g in enumerate(games) if g["date"] == "2025-09-24")
    games[i]["hr"], games[i + 1]["hr"] = 0, 2
    games[i]["cum_hr"] -= 2
    bad["data_hash"] = data_hash(games)
    assert checks.invariants(bad) == []
    facts = read(MODEL / "data" / "2025" / "known_facts.json")
    assert any("2025-09-24" in e for e in checks.known_facts(bad, prior2025, facts))
