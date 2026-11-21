"""Fetch raw data from the MLB Stats API (statsapi.mlb.com). No parsing here; see season.py."""

import json
import urllib.request

BASE = "https://statsapi.mlb.com/api/v1"
USER_AGENT = "calbot-model"


def game_log_url(player_id: int, season: int) -> str:
    return f"{BASE}/people/{player_id}/stats?stats=gameLog&season={season}&group=hitting"


def season_stats_url(player_id: int, season: int) -> str:
    return f"{BASE}/people/{player_id}/stats?stats=season&season={season}&group=hitting"


def schedule_url(team_id: int, season: int) -> str:
    return f"{BASE}/schedule?sportId=1&teamId={team_id}&season={season}&gameType=R"


def get_json(url: str, timeout: float = 30) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)
