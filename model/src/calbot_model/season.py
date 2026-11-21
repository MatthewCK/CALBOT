"""Turn MLB API responses into the season_log format (contract/schema/season_log.schema.json).

The season log has one row per *team* game, in schedule order, including games the
player sat out. The model needs both: home runs come from games he played, and the
remaining schedule decides how many chances he has left.
"""

import hashlib
import json
from datetime import datetime, timezone

from . import mlb

SCHEMA = 1


def _splits(resp: dict) -> list[dict]:
    stats = resp.get("stats") or []
    return stats[0]["splits"] if stats else []


def _schedule_games(schedule: dict) -> list[dict]:
    games = [g for d in schedule.get("dates", []) for g in d["games"]]
    games = [g for g in games if g.get("gameType") == "R"]
    # Postponed games appear twice (original and makeup date) with the same gamePk.
    # Keep the latest entry for each gamePk, which is the one that was (or will be) played.
    by_pk: dict[int, dict] = {}
    for g in games:
        by_pk[g["gamePk"]] = g
    return sorted(by_pk.values(), key=lambda g: (g["gameDate"], g.get("gameNumber", 1)))


def data_hash(games: list[dict]) -> str:
    canon = json.dumps(games, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()


def build_season_log(
    *,
    season: int,
    player_id: int,
    team_id: int,
    game_log: dict,
    schedule: dict,
    game_log_url: str,
    schedule_url: str,
    fetched_at: str,
) -> dict:
    log = [s for s in _splits(game_log) if s.get("gameType") == "R"]
    by_pk = {s["game"]["gamePk"]: s for s in log}
    if len(by_pk) != len(log):
        raise ValueError("game log has duplicate gamePk values")

    sched = _schedule_games(schedule)
    sched_pks = {g["gamePk"] for g in sched}
    missing = [pk for pk in by_pk if pk not in sched_pks]
    if missing:
        raise ValueError(f"game log has games not on the team schedule: {missing}")

    player_name = log[0]["player"]["fullName"] if log else str(player_id)
    team_name = None
    games, cum, pg = [], 0, 0
    for i, g in enumerate(sched, 1):
        home = g["teams"]["home"]["team"]["id"] == team_id
        side, other = ("home", "away") if home else ("away", "home")
        team_name = team_name or g["teams"][side]["team"]["name"]
        s = by_pk.get(g["gamePk"])
        played = s is not None
        hr = s["stat"]["homeRuns"] if played else 0
        cum += hr
        if played:
            pg += 1
        games.append(
            {
                "team_game": i,
                "player_game": pg if played else None,
                "date": g["officialDate"],
                "game_pk": g["gamePk"],
                "opponent": g["teams"][other]["team"]["name"],
                "home": home,
                "final": g["status"]["codedGameState"] == "F",
                "played": played,
                "pa": s["stat"]["plateAppearances"] if played else 0,
                "hr": hr,
                "cum_hr": cum,
            }
        )

    return {
        "schema": SCHEMA,
        "season": season,
        "player": {"id": player_id, "name": player_name},
        "team": {"id": team_id, "name": team_name or str(team_id)},
        "team_games": len(games),
        "source": {"game_log_url": game_log_url, "schedule_url": schedule_url, "fetched_at": fetched_at},
        "data_hash": data_hash(games),
        "games": games,
    }


def build_prior(*, season: int, player_id: int, season_stats: dict, schedule: dict) -> dict:
    """The previous season's totals, which set the model's prior."""
    splits = _splits(season_stats)
    if not splits:
        raise ValueError(f"no {season} season stats for player {player_id}")
    stat = splits[0]["stat"]
    team_games = sum(1 for g in _schedule_games(schedule) if g["status"]["codedGameState"] == "F")
    return {
        "season": season,
        "hr": stat["homeRuns"],
        "games_played": stat["gamesPlayed"],
        "team_games": team_games,
        "source": mlb.season_stats_url(player_id, season),
    }


def fetch(season: int, player_id: int, team_id: int) -> tuple[dict, dict]:
    """Fetch this season's log and last season's prior from the MLB API."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    gl_url, sc_url = mlb.game_log_url(player_id, season), mlb.schedule_url(team_id, season)
    log = build_season_log(
        season=season,
        player_id=player_id,
        team_id=team_id,
        game_log=mlb.get_json(gl_url),
        schedule=mlb.get_json(sc_url),
        game_log_url=gl_url,
        schedule_url=sc_url,
        fetched_at=now,
    )
    # The prior's playing-time share uses last season's schedule for the same team.
    # Fine for Cal; a player who changed teams would need his old team's schedule.
    prior = build_prior(
        season=season - 1,
        player_id=player_id,
        season_stats=mlb.get_json(mlb.season_stats_url(player_id, season - 1)),
        schedule=mlb.get_json(mlb.schedule_url(team_id, season - 1)),
    )
    return log, prior
