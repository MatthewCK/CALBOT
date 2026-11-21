"""The simulation, the bet and the run outputs."""

import numpy as np
import pytest

from calbot_model import bet, model, run


def test_ties_split_the_pot():
    finals = np.array([40, 40, 45, 50])
    # 40: A (38) and B (42) tie, each gets half. 45: B. 50: C (50).
    assert bet.win_probs(finals, [38, 42, 50]) == pytest.approx([0.25, 0.5, 0.25])


def test_win_probs_sum_to_one():
    finals = np.random.default_rng(0).poisson(40, 1000)
    assert sum(bet.win_probs(finals, [29, 34, 38, 43, 47])) == pytest.approx(1)


def test_finished_season_is_certain(log2025, prior2025):
    state = model.game_states(log2025)[-1]
    assert (state.through_game, state.hr, state.games_played, state.remaining) == (162, 60, 159, 0)
    finals = model.simulate(state, model.Prior.from_season(prior2025), 100, np.random.default_rng(1))
    assert set(finals) == {60}


def test_simulation_never_goes_below_current_total(log2025, prior2025):
    state = model.game_states(log2025, through_game=97)[-1]
    finals = model.simulate(state, model.Prior.from_season(prior2025), 5000, np.random.default_rng(2))
    assert finals.min() >= state.hr == 38


def test_preseason_median_is_near_last_season(log2025, prior2025):
    # Before any games, the model should expect about his 2024 pace: 34 HR in 153 games.
    state = model.game_states(log2025, through_game=0)[0]
    finals = model.simulate(state, model.Prior.from_season(prior2025), 20000, np.random.default_rng(3))
    assert 32 <= np.median(finals) <= 36


def test_seed_rule_is_fixed():
    assert model.seed_for(2025, 0) == model.seed_for(2025, 0)
    assert model.seed_for(2025, 0) != model.seed_for(2025, 1)
    # Pin the rule itself, so a change to it is a visible decision.
    # First 8 bytes of sha256(b"2025:0"), computed independently.
    assert model.seed_for(2025, 0) == 0x6C079A4D2E772C52


def test_runs_are_reproducible(log2025, prior2025, bet2025, records):
    kw = dict(through_game=60, simulations=2000, run_id="2026-01-01T00-00-00Z")
    a = run.compute(log2025, prior2025, bet2025, records, **kw)
    b = run.compute(log2025, prior2025, bet2025, records, **kw)
    assert a["odds"]["history"] == b["odds"]["history"]
    assert a["distribution"]["history"] == b["distribution"]["history"]


def test_run_outputs_match_contract(log2025, prior2025, bet2025, records, validate):
    r = run.compute(log2025, prior2025, bet2025, records, simulations=2000, run_id="2026-01-01T00-00-00Z")
    validate("odds", r["odds"])
    validate("distribution", r["distribution"])
    assert len(r["odds"]["history"]) == 163
    for h in r["distribution"]["history"]:
        assert sum(h["probs"]) == pytest.approx(1, abs=1e-3)


def test_through_game_out_of_range(log2025):
    with pytest.raises(ValueError):
        model.game_states(log2025, through_game=163)
