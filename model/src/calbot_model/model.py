"""The simulation model ("Lite"): a home-run rate and a playing-time share, both updated after every game.

For a game state (team games completed so far):

- Home runs per game played ~ Gamma posterior. Prior mean is last season's rate
  (HR / games played), worth PRIOR_RATE_WEIGHT games of evidence.
- Share of team games he plays ~ Beta posterior. Prior mean is last season's share
  (games played / team games), worth PRIOR_PLAY_WEIGHT team games of evidence.
- Each simulation draws a rate and a share, then games left he plays ~ Binomial,
  and home runs in them ~ Poisson(rate x games).

This follows the prototype (web/prototype/build_data.py) with one change: the
prototype treated every one of 162 games as a game he played. With the real log
we know he sat out 3, so the model now also accounts for days off.
"""

import hashlib
from dataclasses import dataclass

import numpy as np

PRIOR_RATE_WEIGHT = 150  # games, as in the prototype
PRIOR_PLAY_WEIGHT = 162  # team games: one season
DEFAULT_SIMULATIONS = 20_000


@dataclass(frozen=True)
class Prior:
    rate: float  # HR per game played
    play_share: float  # games played / team games

    @classmethod
    def from_season(cls, prior: dict) -> "Prior":
        return cls(rate=prior["hr"] / prior["games_played"], play_share=prior["games_played"] / prior["team_games"])


@dataclass(frozen=True)
class GameState:
    through_game: int  # team games completed
    hr: int  # home runs so far
    games_played: int  # games he appeared in so far
    team_games: int  # games on the schedule

    @property
    def remaining(self) -> int:
        return self.team_games - self.through_game


def game_states(season_log: dict, through_game: int | None = None) -> list[GameState]:
    """Game states 0..through_game (default: every final game)."""
    games = season_log["games"]
    n_final = sum(1 for g in games if g["final"])
    if any(not g["final"] for g in games[:n_final]):
        raise ValueError("final games must come first in the season log")
    last = n_final if through_game is None else through_game
    if not 0 <= last <= n_final:
        raise ValueError(f"through_game must be between 0 and {n_final}, got {last}")
    states = [GameState(0, 0, 0, len(games))]
    hr = gp = 0
    for g in games[:last]:
        hr += g["hr"]
        gp += g["played"]
        states.append(GameState(g["team_game"], hr, gp, len(games)))
    return states


def seed_for(season: int, through_game: int) -> int:
    """Fixed rule: first 8 bytes of SHA-256 of "<season>:<through_game>". Same state, same draws."""
    return int.from_bytes(hashlib.sha256(f"{season}:{through_game}".encode()).digest()[:8], "big")


def simulate(state: GameState, prior: Prior, n: int, rng: np.random.Generator) -> np.ndarray:
    """Final season totals for n simulated seasons from this game state."""
    a = prior.rate * PRIOR_RATE_WEIGHT + state.hr
    b = PRIOR_RATE_WEIGHT + state.games_played
    rate = rng.gamma(a, 1 / b, n)

    sat_out = state.through_game - state.games_played
    share = rng.beta(
        prior.play_share * PRIOR_PLAY_WEIGHT + state.games_played,
        (1 - prior.play_share) * PRIOR_PLAY_WEIGHT + sat_out,
        n,
    )
    games_left = rng.binomial(state.remaining, share)
    return state.hr + rng.poisson(rate * games_left)


def percentiles(finals: np.ndarray) -> dict:
    p5, p50, p95 = np.percentile(finals, [5, 50, 95], method="inverted_cdf")
    return {"p5": int(p5), "p50": int(p50), "p95": int(p95)}


def histogram(finals: np.ndarray) -> tuple[int, list[float]]:
    """(start, probs): probs[i] is the share of simulations ending on start + i."""
    start = int(finals.min())
    counts = np.bincount(finals - start)
    return start, [round(float(c), 5) for c in counts / len(finals)]
