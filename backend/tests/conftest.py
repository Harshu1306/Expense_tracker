from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# Use a throw-away SQLite file for the whole test session.  The env var must be
# set *before* database.py is imported.
_TMP_DIR = Path(tempfile.mkdtemp(prefix="spendwise-tests-"))
os.environ["SPENDWISE_DATABASE_URL"] = f"sqlite:///{(_TMP_DIR / 'test.db').as_posix()}"

from database import Base, engine  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_path() -> Path:
    return _TMP_DIR / "test.db"


def make_transaction(
    *,
    tx_id: str = "11111111-1111-4111-8111-111111111111",
    title: str = "Coffee",
    amount_paise: int = 25000,
    type_: str = "expense",
    category: str = "Food",
    date: str = "2026-02-10",
    updated_at: str = "2026-02-10T09:00:00Z",
    **extra,
) -> dict:
    payload = {
        "id": tx_id,
        "title": title,
        "amount_paise": amount_paise,
        "type": type_,
        "category": category,
        "date": date,
        "payment_method": "UPI",
        "notes": extra.pop("notes", None),
        "created_at": extra.pop("created_at", updated_at),
        "updated_at": updated_at,
    }
    payload.update(extra)
    return payload


def sync_op(
    *,
    operation_id: str,
    entity: str = "transaction",
    op_type: str = "CREATE",
    entity_id: str = "11111111-1111-4111-8111-111111111111",
    payload: dict | None = None,
    base_version: int = 0,
    client_timestamp: str = "2026-02-10T09:00:00Z",
) -> dict:
    return {
        "operation_id": operation_id,
        "entity": entity,
        "op_type": op_type,
        "entity_id": entity_id,
        "payload": payload or {},
        "base_version": base_version,
        "client_timestamp": client_timestamp,
    }
