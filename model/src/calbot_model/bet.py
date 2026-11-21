"""The bet: read from a config file (config/bet_<season>.json), scored against simulated totals."""

import json
from pathlib import Path

import numpy as np

RULES = {"closest_wins_ties_split"}
STATS = {"home_runs"}


def load(path: Path) -> dict:
    bet = json.loads(Path(path).read_text(encoding="utf-8"))
    if bet["rule"] not in RULES:
        raise ValueError(f"unknown bet rule {bet['rule']!r}")
    if bet["stat"] not in STATS:
        raise ValueError(f"unknown bet stat {bet['stat']!r}")
    names = [b["name"] for b in bet["bettors"]]
    if len(set(names)) != len(names):
        raise ValueError("bettor names must be unique")
    return bet


def win_probs(finals: np.ndarray, guesses: list[int]) -> list[float]:
    """Closest guess wins; ties split the pot. Returns each bettor's expected share."""
    dist = np.abs(finals[:, None] - np.asarray(guesses)[None, :])
    winners = dist == dist.min(axis=1, keepdims=True)
    share = winners / winners.sum(axis=1, keepdims=True)
    return [float(x) for x in share.mean(axis=0)]
