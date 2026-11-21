"""Events and publishing: append-only ids, no duplicates on rerun, latest.json written last."""

import json
from collections import Counter

import pytest

from calbot_model import publish, run


@pytest.fixture(scope="module")
def full(log2025, prior2025, bet2025, records):
    return run.compute(log2025, prior2025, bet2025, records, simulations=2000, run_id="2026-01-02T00-00-00Z")


def test_one_event_per_home_run(full):
    hrs = [e for e in full["events"] if e["type"] == "home_run"]
    assert [e["season_total"] for e in hrs] == list(range(1, 61))
    sixty = hrs[-1]
    assert (sixty["date"], sixty["hr_in_game"]) == ("2025-09-24", 2)


def test_records_fire_once_on_the_right_day(full):
    rec = {e["record"]["id"]: (e["date"], e["season_total"]) for e in full["events"] if e["type"] == "record"}
    assert rec == {
        "perez_catcher": ("2025-08-24", 49),
        "mantle_switch": ("2025-09-16", 56),
        "griffey_mariners": ("2025-09-20", 57),
        "sixty_club": ("2025-09-24", 60),
    }


def test_event_keys_are_unique(full):
    assert max(Counter(e["key"] for e in full["events"]).values()) == 1


def test_publish_layout_and_rerun(tmp_path, full, log2025, prior2025, bet2025, records, validate):
    # Publish part of the season, then the whole season: earlier events keep their ids.
    part = run.compute(log2025, prior2025, bet2025, records, through_game=80, simulations=2000,
                       run_id="2026-01-01T00-00-00Z")
    publish.publish(tmp_path, part)
    first = json.loads((tmp_path / "events.json").read_text())

    latest = publish.publish(tmp_path, full)
    events = json.loads((tmp_path / "events.json").read_text())

    assert events["events"][: len(first["events"])] == first["events"]
    ids = [e["id"] for e in events["events"]]
    assert ids == list(range(1, len(ids) + 1))
    assert latest["last_event_id"] == events["last_event_id"] == ids[-1]
    assert latest["run_id"] == "2026-01-02T00-00-00Z"

    validate("latest", latest)
    validate("events", events)
    run_dir = tmp_path / "runs" / latest["run_id"]
    for name in ("odds", "distribution", "season_log"):
        validate(name, json.loads((run_dir / f"{name}.json").read_text()))
    assert not list(tmp_path.rglob("*.tmp"))


def test_run_folders_are_immutable(tmp_path, full):
    publish.publish(tmp_path, full)
    with pytest.raises(FileExistsError):
        publish.publish(tmp_path, full)


def test_merge_skips_known_keys():
    e = {"key": "k1", "type": "home_run"}
    once = publish.merge_events(None, [e])
    twice = publish.merge_events(once, [e, {"key": "k2", "type": "home_run"}])
    assert [x["id"] for x in twice["events"]] == [1, 2]
    assert twice["last_event_id"] == 2
