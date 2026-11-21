"""Write outputs in the contract layout, atomically: run folder, then events.json, then latest.json last.

Each file is written to a temp name and renamed into place, so a reader never sees a half-written file.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from . import __version__

SCHEMA = 1


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, path)


def merge_events(existing: dict | None, new: list[dict]) -> dict:
    """Append events whose key isn't published yet. Existing events are never changed or renumbered."""
    existing = existing or {"schema": SCHEMA, "last_event_id": 0, "events": []}
    if existing.get("schema") != SCHEMA:
        raise ValueError(f"events.json has schema {existing.get('schema')}, expected {SCHEMA}")
    seen = {e["key"] for e in existing["events"]}
    events = list(existing["events"])
    last = existing["last_event_id"]
    for e in new:
        if e["key"] in seen:
            continue
        last += 1
        events.append({"id": last, **e})
        seen.add(e["key"])
    return {"schema": SCHEMA, "last_event_id": last, "events": events}


def publish(out_dir: Path, result: dict, now: datetime | None = None) -> dict:
    out_dir = Path(out_dir)
    run_id = result["odds"]["run_id"]
    run_dir = out_dir / "runs" / run_id
    if run_dir.exists():
        raise FileExistsError(f"run folder {run_dir} already exists; run folders are immutable")

    # 1. The run folder.
    for name in ("odds", "distribution", "season_log"):
        _write(run_dir / f"{name}.json", result[name])

    # 2. events.json (append-only).
    events_path = out_dir / "events.json"
    existing = json.loads(events_path.read_text(encoding="utf-8")) if events_path.exists() else None
    events = merge_events(existing, result["events"])
    _write(events_path, events)

    # 3. latest.json, last.
    now = now or datetime.now(timezone.utc)
    latest = {
        "schema": SCHEMA,
        "run_id": run_id,
        "last_event_id": events["last_event_id"],
        "model_version": __version__,
        "updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    _write(out_dir / "latest.json", latest)
    return latest
