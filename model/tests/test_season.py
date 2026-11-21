"""Parsing MLB API responses into the season log, with small hand-made responses."""

import pytest

from calbot_model import checks
from calbot_model.season import build_season_log

TEAM, OPP = 136, 133


def sched_game(pk, date, state="F", home=True, game_number=1):
    me = {"team": {"id": TEAM, "name": "Seattle Mariners"}}
    them = {"team": {"id": OPP, "name": "Athletics"}}
    return {
        "gamePk": pk, "gameType": "R", "gameDate": f"{date}T20:00:00Z", "officialDate": date,
        "gameNumber": game_number, "status": {"codedGameState": state},
        "teams": {"home": me, "away": them} if home else {"home": them, "away": me},
    }


def log_split(pk, hr, pa=4):
    return {"gameType": "R", "game": {"gamePk": pk}, "player": {"fullName": "Cal Raleigh"},
            "stat": {"homeRuns": hr, "plateAppearances": pa}}


def build(sched, splits):
    return build_season_log(
        season=2025, player_id=663728, team_id=TEAM,
        game_log={"stats": [{"splits": splits}]},
        schedule={"dates": [{"games": [g]} for g in sched]},
        game_log_url="u", schedule_url="s", fetched_at="2025-01-01T00:00:00Z",
    )


def test_sat_out_games_are_rows_with_no_stats():
    sched = [sched_game(1, "2025-04-01"), sched_game(2, "2025-04-02", home=False), sched_game(3, "2025-04-03")]
    log = build(sched, [log_split(1, 1), log_split(3, 2)])
    g = log["games"]
    assert [x["played"] for x in g] == [True, False, True]
    assert [x["player_game"] for x in g] == [1, None, 2]
    assert [x["cum_hr"] for x in g] == [1, 1, 3]
    assert g[1]["home"] is False and g[1]["opponent"] == "Athletics"
    assert checks.invariants(log) == []


def test_postponed_game_counts_once_on_its_makeup_date():
    sched = [sched_game(1, "2025-04-01", state="D"), sched_game(2, "2025-04-02"), sched_game(1, "2025-04-03")]
    log = build(sched, [log_split(1, 1), log_split(2, 0)])
    assert [(x["game_pk"], x["date"]) for x in log["games"]] == [(2, "2025-04-02"), (1, "2025-04-03")]


def test_unplayed_games_are_not_final():
    sched = [sched_game(1, "2025-04-01"), sched_game(2, "2025-04-02", state="S")]
    log = build(sched, [log_split(1, 0)])
    assert [x["final"] for x in log["games"]] == [True, False]


def test_game_not_on_schedule_is_an_error():
    with pytest.raises(ValueError, match="not on the team schedule"):
        build([sched_game(1, "2025-04-01")], [log_split(99, 1)])
