import json
from pathlib import Path

import pytest

MODEL = Path(__file__).resolve().parents[1]
CONTRACT = MODEL.parent / "contract" / "schema"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def log2025():
    return read(MODEL / "data" / "2025" / "season_log.json")


@pytest.fixture(scope="session")
def prior2025():
    return read(MODEL / "data" / "2025" / "prior.json")


@pytest.fixture(scope="session")
def bet2025():
    from calbot_model import bet

    return bet.load(MODEL / "config" / "bet_2025.json")


@pytest.fixture(scope="session")
def records():
    return read(MODEL / "config" / "records.json")["records"]


@pytest.fixture(scope="session")
def validate():
    from jsonschema import Draft202012Validator

    def _validate(name: str, data: dict) -> None:
        schema = read(CONTRACT / f"{name}.schema.json")
        v = Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)
        errors = [e.message for e in v.iter_errors(data)]
        assert not errors, errors[:5]

    return _validate
