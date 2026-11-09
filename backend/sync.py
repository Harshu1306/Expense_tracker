"""Idempotent synchronisation API.

Every queued client operation carries a UUID ``operation_id``.  The server
keeps a ledger (``sync_operations``) keyed by that id, so retries after a lost
response return the original result instead of writing twice.

Conflict policy: last-write-wins guarded by ``base_version`` (see crud.py and
the README).  Losing writes are returned with ``status="conflict"`` and the
current server record, never silently dropped.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from crud import (
    budget_dict,
    delete_budget,
    delete_transaction,
    transaction_dict,
    update_budget,
    update_transaction,
    upsert_budget,
    upsert_transaction,
)
from database import get_db
from models import Budget, SyncOperation, Transaction
from schemas import (
    BudgetCreate,
    BudgetOut,
    BudgetUpdate,
    SyncChangesOut,
    SyncOperationIn,
    SyncOperationResult,
    SyncRequest,
    SyncResponse,
    SyncStatusOut,
    TransactionCreate,
    TransactionOut,
    TransactionUpdate,
)
from utils import parse_iso, to_naive_utc, utcnow

router = APIRouter(prefix="/api/sync", tags=["sync"])


def _record_dict(entity: str, record) -> dict | None:
    if record is None:
        return None
    return transaction_dict(record) if entity == "transaction" else budget_dict(record)


def _validate_payload(op: SyncOperationIn, now: datetime):
    """Turn a sync payload into the strongly typed model used by crud."""
    payload = dict(op.payload or {})
    payload["id"] = op.entity_id

    if op.entity == "transaction":
        if op.op_type == "CREATE":
            return TransactionCreate.model_validate(payload)
        if op.op_type == "UPDATE":
            if not payload.get("updated_at"):
                payload["updated_at"] = op.client_timestamp or now
            return TransactionUpdate.model_validate(payload)
        return None

    if op.entity == "budget":
        if op.op_type == "CREATE":
            return BudgetCreate.model_validate(payload)
        if op.op_type == "UPDATE":
            if not payload.get("updated_at"):
                payload["updated_at"] = op.client_timestamp or now
            return BudgetUpdate.model_validate(payload)
        return None

    raise ValueError(f"Unknown entity: {op.entity}")


def _execute(db: Session, op: SyncOperationIn, now: datetime) -> SyncOperationResult:
    data = _validate_payload(op, now)
    timestamp = to_naive_utc(op.client_timestamp) if op.client_timestamp else now

    if op.entity == "transaction":
        if op.op_type == "CREATE":
            outcome = upsert_transaction(db, data, base_version=op.base_version, is_create=True)
        elif op.op_type == "UPDATE":
            outcome = update_transaction(
                db, op.entity_id, data, base_version=op.base_version
            )
        else:
            outcome = delete_transaction(
                db,
                op.entity_id,
                deleted_at=timestamp,
                snapshot=op.payload or None,
            )
    else:
        if op.op_type == "CREATE":
            outcome = upsert_budget(db, data, is_create=True)
        elif op.op_type == "UPDATE":
            outcome = update_budget(db, op.entity_id, data, base_version=op.base_version)
        else:
            outcome = delete_budget(db, op.entity_id, deleted_at=timestamp)

    record = _record_dict(op.entity, outcome.record)
    return SyncOperationResult(
        operation_id=op.operation_id,
        entity=op.entity,
        entity_id=op.entity_id,
        status=outcome.status,
        server_version=record.get("version") if record else None,
        record=record,
        message=outcome.message,
    )


def _store_result(db: Session, result: SyncOperationResult, op: SyncOperationIn) -> None:
    ledger = SyncOperation(
        operation_id=op.operation_id,
        entity=op.entity,
        op_type=op.op_type,
        entity_id=op.entity_id,
        status=result.status,
        result_json=result.model_dump_json(),
        processed_at=utcnow(),
    )
    db.add(ledger)
    db.commit()


@router.post("", response_model=SyncResponse, summary="Replay a batch of client operations")
def sync_operations(request: SyncRequest, db: Session = Depends(get_db)) -> SyncResponse:
    now = utcnow()
    results: list[SyncOperationResult] = []

    for op in request.operations:
        ledger = db.get(SyncOperation, op.operation_id)
        if ledger is not None:
            cached = SyncOperationResult.model_validate_json(ledger.result_json)
            cached.duplicate = True
            results.append(cached)
            continue

        try:
            result = _execute(db, op, now)
        except ValidationError as exc:
            db.rollback()
            result = SyncOperationResult(
                operation_id=op.operation_id,
                entity=op.entity,
                entity_id=op.entity_id,
                status="error",
                message=f"Invalid payload: {exc.errors()[0].get('msg', 'validation failed')}",
            )
        except Exception as exc:  # pragma: no cover - defensive
            db.rollback()
            result = SyncOperationResult(
                operation_id=op.operation_id,
                entity=op.entity,
                entity_id=op.entity_id,
                status="error",
                message=f"Unexpected server error: {exc}",
            )

        if result.status != "error":
            _store_result(db, result, op)
        results.append(result)

    return SyncResponse(
        results=results,
        server_time=now,
        applied=sum(1 for r in results if r.status == "applied"),
        duplicates=sum(1 for r in results if r.duplicate or r.status == "duplicate"),
        conflicts=sum(1 for r in results if r.status == "conflict"),
        errors=sum(1 for r in results if r.status in {"error", "not_found"}),
    )


@router.get("/status", response_model=SyncStatusOut, summary="Server sync status")
def sync_status(db: Session = Depends(get_db)) -> SyncStatusOut:
    transaction_count = int(
        db.scalar(
            select(func.count(Transaction.id)).where(Transaction.deleted_at.is_(None))
        )
        or 0
    )
    deleted_transaction_count = int(
        db.scalar(
            select(func.count(Transaction.id)).where(Transaction.deleted_at.is_not(None))
        )
        or 0
    )
    budget_count = int(
        db.scalar(select(func.count(Budget.id)).where(Budget.deleted_at.is_(None))) or 0
    )
    deleted_budget_count = int(
        db.scalar(select(func.count(Budget.id)).where(Budget.deleted_at.is_not(None))) or 0
    )
    operations_processed = int(
        db.scalar(select(func.count(SyncOperation.operation_id))) or 0
    )
    last_tx = db.scalar(select(func.max(Transaction.updated_at)))
    last_budget = db.scalar(select(func.max(Budget.updated_at)))
    candidates = [value for value in (last_tx, last_budget) if value is not None]

    return SyncStatusOut(
        server_time=utcnow(),
        transaction_count=transaction_count,
        deleted_transaction_count=deleted_transaction_count,
        budget_count=budget_count,
        deleted_budget_count=deleted_budget_count,
        operations_processed=operations_processed,
        last_change_at=max(candidates) if candidates else None,
    )


@router.get("/changes", response_model=SyncChangesOut, summary="Pull server changes since a timestamp")
def sync_changes(
    since: str | None = Query(default=None, description="ISO-8601 timestamp, inclusive-exclusive"),
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
) -> SyncChangesOut:
    server_time = utcnow()
    since_dt = parse_iso(since) if since else None
    if since and since_dt is None:
        raise HTTPException(status_code=422, detail="since must be an ISO-8601 timestamp")

    tx_stmt = select(Transaction).where(Transaction.updated_at <= server_time)
    budget_stmt = select(Budget).where(Budget.updated_at <= server_time)
    if since_dt is not None:
        tx_stmt = tx_stmt.where(Transaction.updated_at > since_dt)
        budget_stmt = budget_stmt.where(Budget.updated_at > since_dt)

    transactions = list(
        db.scalars(tx_stmt.order_by(Transaction.updated_at.asc()).limit(limit + 1)).all()
    )
    budgets = list(
        db.scalars(budget_stmt.order_by(Budget.updated_at.asc()).limit(limit + 1)).all()
    )
    has_more = len(transactions) > limit or len(budgets) > limit

    return SyncChangesOut(
        server_time=server_time,
        transactions=[TransactionOut.model_validate(tx) for tx in transactions[:limit]],
        budgets=[BudgetOut.model_validate(budget) for budget in budgets[:limit]],
        has_more=has_more,
    )
