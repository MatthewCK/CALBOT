"""Event detection: what the bot should announce. Events are derived from the data and odds,
each with a stable key, so rerunning never creates duplicates (publish.py merges by key)."""


def detect(season_log: dict, history: list[dict], bettors: list[dict], records: list[dict]) -> list[dict]:
    """Events through the last game in history, in game order. No ids yet; publish assigns them.

    history[i] is the odds entry for game state i (history[0] is before the season).
    """
    season = season_log["season"]
    last = history[-1]["through_game"]
    games = season_log["games"][:last]
    names = [b["name"] for b in bettors]
    events = []

    prev_total = 0
    for g in games:
        base = {"season": season, "team_game": g["team_game"], "date": g["date"]}
        if g["hr"]:
            # One home_run event per homer, so the bot can count along ("that's 59... and 60").
            for k in range(1, g["hr"] + 1):
                total = prev_total + k
                events.append({**base, "key": f"{season}:hr:{total}", "type": "home_run", "hr_in_game": k, "season_total": total})
            if g["hr"] >= 2:
                events.append({**base, "key": f"{season}:multi:{g['game_pk']}", "type": "multi_homer", "hr_in_game": g["hr"], "season_total": g["cum_hr"]})
            for r in records:
                hit = g["cum_hr"] > r["mark"] if r["trigger"] == "pass" else g["cum_hr"] >= r["mark"]
                was = prev_total > r["mark"] if r["trigger"] == "pass" else prev_total >= r["mark"]
                if hit and not was:
                    events.append({**base, "key": f"{season}:record:{r['id']}", "type": "record", "season_total": g["cum_hr"],
                                   "record": {k: r[k] for k in ("id", "label", "mark", "trigger")}})
        prev_total = g["cum_hr"]

        # Lead change: the favorite (highest win chance) after this game differs from before it.
        before, after = history[g["team_game"] - 1]["win_prob"], history[g["team_game"]]["win_prob"]
        lb, la = _leader(before), _leader(after)
        if la != lb:
            events.append({**base, "key": f"{season}:lead:{g['team_game']}:{names[la]}", "type": "lead_change",
                           "leader": names[la], "previous_leader": names[lb], "win_prob": after[la]})
    return events


def _leader(probs: list[float]) -> int:
    return max(range(len(probs)), key=lambda i: probs[i])
