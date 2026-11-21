"""Command-line entry point (`calbot-model`).

    calbot-model fetch --season 2025      MLB API -> data/<season>/season_log.json and prior.json, then checks
    calbot-model check --season 2025      run the data checks on the saved data
    calbot-model run --season 2025        simulate and publish to outputs/ (contract layout)
"""

import argparse
import json
import sys
from pathlib import Path

from . import bet as bet_mod, checks, model, publish, run, season as season_mod

ROOT = Path(__file__).resolve().parents[2]  # model/
DATA, CONFIG = ROOT / "data", ROOT / "config"


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")


def _check(season: int, log: dict, prior: dict) -> bool:
    errors = checks.run_all(log, prior, DATA / str(season) / "known_facts.json")
    for e in errors:
        print(f"check failed: {e}", file=sys.stderr)
    if not errors:
        g = log["games"]
        print(f"checks passed: {g[-1]['cum_hr'] if g else 0} HR in {sum(x['played'] for x in g)} of {len(g)} team games")
    return not errors


def cmd_fetch(args) -> int:
    bet = bet_mod.load(CONFIG / f"bet_{args.season}.json")
    log, prior = season_mod.fetch(args.season, bet["player_id"], bet["team_id"])
    ok = _check(args.season, log, prior)
    if not ok and not args.force:
        print("not saving data that fails checks (use --force to save anyway)", file=sys.stderr)
        return 1
    d = DATA / str(args.season)
    _write(d / "season_log.json", log)
    _write(d / "prior.json", prior)
    print(f"saved {d / 'season_log.json'} (data_hash {log['data_hash'][:12]})")
    return 0 if ok else 1


def cmd_check(args) -> int:
    d = DATA / str(args.season)
    return 0 if _check(args.season, _read(d / "season_log.json"), _read(d / "prior.json")) else 1


def cmd_run(args) -> int:
    d = DATA / str(args.season)
    log, prior = _read(d / "season_log.json"), _read(d / "prior.json")
    if not _check(args.season, log, prior):
        return 1
    bet = bet_mod.load(CONFIG / f"bet_{args.season}.json")
    records = _read(CONFIG / "records.json")["records"]
    result = run.compute(log, prior, bet, records, through_game=args.through_game,
                         simulations=args.simulations, run_id=args.run_id)
    latest = publish.publish(Path(args.out), result)
    o = result["odds"]
    print(f"published run {latest['run_id']} to {args.out}: through game {o['through_game']}, {o['hr']} HR, "
          f"median final {o['percentiles']['p50']}, last_event_id {latest['last_event_id']}")
    for b in o["bettors"]:
        print(f"  {b['name']:<10} {b['guess']:>3}  {b['win_prob']:6.1%}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="calbot-model")
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("fetch", help="fetch the season from the MLB API and check it")
    f.add_argument("--season", type=int, required=True)
    f.add_argument("--force", action="store_true", help="save even if checks fail")
    f.set_defaults(func=cmd_fetch)

    c = sub.add_parser("check", help="run data checks on saved data")
    c.add_argument("--season", type=int, required=True)
    c.set_defaults(func=cmd_check)

    r = sub.add_parser("run", help="simulate and publish outputs")
    r.add_argument("--season", type=int, required=True)
    r.add_argument("--through-game", type=int, help="game state to run as of (default: every final game)")
    r.add_argument("--simulations", type=int, default=model.DEFAULT_SIMULATIONS)
    r.add_argument("--out", default=str(ROOT / "outputs"))
    r.add_argument("--run-id", help="override the run id (default: current UTC time)")
    r.set_defaults(func=cmd_run)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
