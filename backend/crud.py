"""Database access and last-write-wins write helpers.

Write policy (documented in README):
* every row has a monotonic ``version`` and a logical ``updated_at``;
* a client sends the ``base_version`` it last saw;
* if the base version still matches, the write applies;
* if it does not, the write with the **latest ``updated_at``** wins
  (last-write-wins).  Equal timestamps keep the server copy;
* a losing write is reported as ``conflict`` together with the server record;
  the client surfaces the conflict instead of silently discarding it;
* deletes are tombstones (``deleted_at``) so they can be replayed/pulled.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Literal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from models import Budget, Transaction
from schemas import (
    BudgetCreate,
    BudgetOut,
    BudgetUpdate,
    TransactionCreate,
    TransactionOut,
    TransactionUpdate,
)
from utils import month_bounds, to_naive_utc, utcnow

OutcomeStatus = Literal["applied", "duplicate", "ignored", "conflict", "not_found"]


@dataclass
class Outcome:
    status: OutcomeStatus
    record: Transaction | Budget | None = None
    message: str | None = None


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------
def transaction_dict(tx: Transaction) -> dict[str, Any]:
    return TransactionOut.model_validate(tx).model_dump(mode="json")


def budget_dict(budget: Budget) -> dict[str, Any]:
    return BudgetOut.model_validate(budget).model_dump(mode="json")


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------
def get_transaction(
    db: Session, transaction_id: str, *, include_deleted: bool = False
) -> Transaction | None:
    tx = db.get(Transaction, transaction_id)
    if tx is None:
        return None
    if tx.deleted_at is not None and not include_deleted:
        return None
    return tx


def list_transactions(
    db: Session,
    *,
    q: str | None = None,
    type: str | None = None,
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    month: int | None = None,
    year: int | None = None,
    include_deleted: bool = False,
    limit: int = 200,
    offset: int = 0,
    sort: str = "date_desc",
) -> tuple[list[Transaction], int]:
    stmt = select(Transaction)
    if not include_deleted:
        stmt = stmt.where(Transaction.deleted_at.is_(None))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Transaction.title.ilike(like),
                Transaction.notes.ilike(like),
                Transaction.category.ilike(like),
            )
        )
    if type:
        stmt = stmt.where(Transaction.type == type)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if start_date:
        stmt = stmt.where(Transaction.date >= start_date)
    if end_date:
        stmt = stmt.where(Transaction.date <= end_date)
    if month and year:
        first, last = month_bounds(year, month)
        stmt = stmt.where(Transaction.date >= first, Transaction.date < last)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    order = {
        "date_asc": (Transaction.date.asc(), Transaction.created_at.asc()),
        "date_desc": (Transaction.date.desc(), Transaction.created_at.desc()),
        "amount_asc": (Transaction.amount_paise.asc(),),
        "amount_desc": (Transaction.amount_paise.desc(),),
        "updated_asc": (Transaction.updated_at.asc(),),
        "updated_desc": (Transaction.updated_at.desc(),),
    }.get(sort, (Transaction.date.desc(), Transaction.created_at.desc()))

    stmt = stmt.order_by(*order).limit(limit).offset(offset)
    return list(db.scalars(stmt).all()), total


def list_budgets(
    db: Session,
    *,
    month: int | None = None,
    year: int | None = None,
    include_deleted: bool = False,
) -> list[Budget]:
    stmt = select(Budget)
    if not include_deleted:
        stmt = stmt.where(Budget.deleted_at.is_(None))
    if month:
        stmt = stmt.where(Budget.month == month)
    if year:
        stmt = stmt.where(Budget.year == year)
    stmt = stmt.order_by(Budget.year.desc(), Budget.month.desc(), Budget.category.asc())
    return list(db.scalars(stmt).all())


def get_budget(db: Session, budget_id: str, *, include_deleted: bool = False) -> Budget | None:
    budget = db.get(Budget, budget_id)
    if budget is None:
        return None
    if budget.deleted_at is not None and not include_deleted:
        return None
    return budget


def find_active_budget(
    db: Session, *, category: str, month: int, year: int, exclude_id: str | None = None
) -> Budget | None:
    stmt = select(Budget).where(
        Budget.category == category,
        Budget.month == month,
        Budget.year == year,
        Budget.deleted_at.is_(None),
    )
    if exclude_id:
        stmt = stmt.where(Budget.id != exclude_id)
    return db.scalars(stmt.limit(1)).first()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _next_timestamp(incoming: datetime, existing: datetime) -> datetime:
    """Keep ``updated_at`` strictly increasing so delta pulls never miss a row."""
    if incoming > existing:
        return incoming
    return existing + timedelta(microseconds=1)


def _apply_transaction_fields(tx: Transaction, data: TransactionUpdate) -> None:
    values = data.model_dump(exclude_unset=True)
    for field in (
        "title",
        "amount_paise",
        "type",
        "category",
        "date",
        "payment_method",
        "notes",
    ):
        if field in values:
            setattr(tx, field, values[field])


def _apply_budget_fields(budget: Budget, data: BudgetUpdate) -> None:
    values = data.model_dump(exclude_unset=True)
    for field in ("category", "monthly_limit_paise", "month", "year"):
        if field in values:
            setattr(budget, field, values[field])


# ---------------------------------------------------------------------------
# Transaction writes
# ---------------------------------------------------------------------------
def upsert_transaction(
    db: Session,
    data: TransactionCreate,
    *,
    base_version: int = 0,
    is_create: bool = True,
    now: datetime | None = None,
) -> Outcome:
    """Create or update a transaction using the LWW policy.

    ``is_create=False`` is used by the UPDATE sync operation and requires the
    row to exist.  CREATE is idempotent when the same id/timestamp is replayed.
    """
    now = now or utcnow()
    transaction_id = data.id or str(uuid.uuid4())
    existing = db.get(Transaction, transaction_id)
    incoming_updated = to_naive_utc(data.updated_at) if data.updated_at else now
    created_at = to_naive_utc(data.created_at) if data.created_at else incoming_updated

    if existing is None:
        if not is_create:
            return Outcome("not_found", None, "Transaction does not exist on the server")
        tx = Transaction(
            id=transaction_id,
            title=data.title,
            amount_paise=data.amount_paise,
            type=data.type,
            category=data.category,
            date=data.date,
            payment_method=data.payment_method,
            notes=data.notes,
            created_at=created_at,
            updated_at=incoming_updated,
            version=max(1, data.version or 1),
            deleted_at=None,
        )
        db.add(tx)
        db.commit()
        db.refresh(tx)
        return Outcome("applied", tx)

    if incoming_updated > existing.updated_at:
        _apply_transaction_fields(existing, TransactionUpdate(**data.model_dump()))
        existing.deleted_at = None
        existing.updated_at = _next_timestamp(incoming_updated, existing.updated_at)
        existing.version += 1
        db.commit()
        db.refresh(existing)
        return Outcome("applied", existing, "Client write won (last-write-wins)")

    if incoming_updated == existing.updated_at and is_create:
        return Outcome("duplicate", existing, "Transaction already exists")

    return Outcome(
        "conflict",
        existing,
        "Server copy is newer; client write rejected (last-write-wins)",
    )


def update_transaction(
    db: Session,
    transaction_id: str,
    data: TransactionUpdate,
    *,
    base_version: int | None = None,
    now: datetime | None = None,
) -> Outcome:
    now = now or utcnow()
    existing = db.get(Transaction, transaction_id)
    if existing is None:
        return Outcome("not_found", None, "Transaction does not exist")

    incoming_updated = to_naive_utc(data.updated_at) if data.updated_at else now
    version_matches = base_version is None or base_version == existing.version

    if version_matches or incoming_updated > existing.updated_at:
        _apply_transaction_fields(existing, data)
        existing.deleted_at = None
        existing.updated_at = _next_timestamp(incoming_updated, existing.updated_at)
        existing.version += 1
        db.commit()
        db.refresh(existing)
        message = None if version_matches else "Client write won (last-write-wins)"
        return Outcome("applied", existing, message)

    return Outcome(
        "conflict",
        existing,
        "Version mismatch and the server copy is newer (last-write-wins)",
    )


def delete_transaction(
    db: Session,
    transaction_id: str,
    *,
    deleted_at: datetime | None = None,
    snapshot: dict[str, Any] | None = None,
) -> Outcome:
    """Soft-delete.  Idempotent, and creates a tombstone if the row is absent."""
    now = to_naive_utc(deleted_at) if deleted_at else utcnow()
    existing = db.get(Transaction, transaction_id)

    if existing is None:
        snapshot = snapshot or {}
        raw_date = snapshot.get("date")
        try:
            tx_date = date.fromisoformat(raw_date) if isinstance(raw_date, str) else raw_date
        except ValueError:
            tx_date = None
        if not isinstance(tx_date, date):
            tx_date = now.date()
        tx = Transaction(
            id=transaction_id,
            title=str(snapshot.get("title") or "[deleted]"),
            amount_paise=int(snapshot.get("amount_paise") or 0),
            type=str(snapshot.get("type") or "expense"),
            category=str(snapshot.get("category") or "Others"),
            date=tx_date,
            payment_method=str(snapshot.get("payment_method") or "Other"),
            notes=snapshot.get("notes"),
            created_at=now,
            updated_at=now,
            version=1,
            deleted_at=now,
        )
        db.add(tx)
        db.commit()
        db.refresh(tx)
        return Outcome("applied", tx, "Tombstone created for unknown transaction")

    if existing.deleted_at is not None:
        return Outcome("ignored", existing, "Transaction was already deleted")

    if now > existing.updated_at:
        existing.deleted_at = now
        existing.updated_at = _next_timestamp(now, existing.updated_at)
        existing.version += 1
        db.commit()
        db.refresh(existing)
        return Outcome("applied", existing, None)

    return Outcome(
        "conflict",
        existing,
        "Server copy was edited after the client deletion (last-write-wins)",
    )


# ---------------------------------------------------------------------------
# Budget writes
# ---------------------------------------------------------------------------
def _tombstone_budget_conflict(
    db: Session, existing: Budget, incoming_updated: datetime
) -> None:
    """Soft-delete a budget that loses a same-period conflict."""
    existing.deleted_at = incoming_updated
    existing.updated_at = _next_timestamp(incoming_updated, existing.updated_at)
    existing.version += 1


def upsert_budget(
    db: Session,
    data: BudgetCreate,
    *,
    is_create: bool = True,
    now: datetime | None = None,
) -> Outcome:
    now = now or utcnow()
    budget_id = data.id or str(uuid.uuid4())
    existing = db.get(Budget, budget_id)
    incoming_updated = to_naive_utc(data.updated_at) if data.updated_at else now
    created_at = to_naive_utc(data.created_at) if data.created_at else incoming_updated

    clash = find_active_budget(
        db,
        category=data.category,
        month=data.month,
        year=data.year,
        exclude_id=budget_id,
    )

    if existing is None:
        if not is_create:
            return Outcome("not_found", None, "Budget does not exist on the server")
        if clash is not None:
            if incoming_updated > clash.updated_at:
                _tombstone_budget_conflict(db, clash, incoming_updated)
            else:
                return Outcome(
                    "conflict",
                    clash,
                    "A newer budget already exists for this category and month",
                )
        budget = Budget(
            id=budget_id,
            category=data.category,
            monthly_limit_paise=data.monthly_limit_paise,
            month=data.month,
            year=data.year,
            created_at=created_at,
            updated_at=incoming_updated,
            version=max(1, data.version or 1),
            deleted_at=None,
        )
        db.add(budget)
        db.commit()
        db.refresh(budget)
        return Outcome("applied", budget)

    if incoming_updated > existing.updated_at:
        if clash is not None and incoming_updated > clash.updated_at:
            _tombstone_budget_conflict(db, clash, incoming_updated)
        _apply_budget_fields(existing, BudgetUpdate(**data.model_dump()))
        existing.deleted_at = None
        existing.updated_at = _next_timestamp(incoming_updated, existing.updated_at)
        existing.version += 1
        db.commit()
        db.refresh(existing)
        return Outcome("applied", existing, "Client write won (last-write-wins)")

    if incoming_updated == existing.updated_at and is_create:
        return Outcome("duplicate", existing, "Budget already exists")

    return Outcome(
        "conflict",
        existing,
        "Server copy is newer; client write rejected (last-write-wins)",
    )


def update_budget(
    db: Session,
    budget_id: str,
    data: BudgetUpdate,
    *,
    base_version: int | None = None,
    now: datetime | None = None,
) -> Outcome:
    now = now or utcnow()
    existing = db.get(Budget, budget_id)
    if existing is None:
        return Outcome("not_found", None, "Budget does not exist")

    incoming_updated = to_naive_utc(data.updated_at) if data.updated_at else now
    version_matches = base_version is None or base_version == existing.version

    if version_matches or incoming_updated > existing.updated_at:
        _apply_budget_fields(existing, data)
        existing.deleted_at = None
        existing.updated_at = _next_timestamp(incoming_updated, existing.updated_at)
        existing.version += 1
        db.commit()
        db.refresh(existing)
        message = None if version_matches else "Client write won (last-write-wins)"
        return Outcome("applied", existing, message)

    return Outcome(
        "conflict",
        existing,
        "Version mismatch and the server copy is newer (last-write-wins)",
    )


def delete_budget(
    db: Session, budget_id: str, *, deleted_at: datetime | None = None
) -> Outcome:
    now = to_naive_utc(deleted_at) if deleted_at else utcnow()
    existing = db.get(Budget, budget_id)
    if existing is None:
        return Outcome("ignored", None, "Budget does not exist")
    if existing.deleted_at is not None:
        return Outcome("ignored", existing, "Budget was already deleted")
    if now > existing.updated_at:
        existing.deleted_at = now
        existing.updated_at = _next_timestamp(now, existing.updated_at)
        existing.version += 1
        db.commit()
        db.refresh(existing)
        return Outcome("applied", existing)
    return Outcome("conflict", existing, "Server copy is newer (last-write-wins)")
