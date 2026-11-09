"""SQLAlchemy models.

Deletes are soft deletes (``deleted_at`` tombstones) so that a deletion made
offline can be replayed and pulled by other devices.  Every mutable row also
carries a monotonically increasing ``version`` used by the sync conflict
policy (see ``sync.py``).
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from utils import utcnow


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), nullable=False, default="Cash")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_transactions_date", "date"),
        Index("ix_transactions_type", "type"),
        Index("ix_transactions_category", "category"),
        Index("ix_transactions_updated_at", "updated_at"),
        Index("ix_transactions_deleted_at", "deleted_at"),
    )


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # "All" is the overall monthly budget; other values are category budgets.
    category: Mapped[str] = mapped_column(String(40), nullable=False, default="All")
    monthly_limit_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_budgets_period", "year", "month"),
        Index("ix_budgets_updated_at", "updated_at"),
        Index("ix_budgets_deleted_at", "deleted_at"),
    )


class SyncOperation(Base):
    """Idempotency ledger for the sync API.

    The primary key is the client-generated ``operation_id``.  If the same
    operation is retried (for example because the response was lost), the
    stored result is replayed instead of applying the write twice.
    """

    __tablename__ = "sync_operations"

    operation_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    entity: Mapped[str] = mapped_column(String(20), nullable=False)
    op_type: Mapped[str] = mapped_column(String(10), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    result_json: Mapped[str] = mapped_column(Text, nullable=False)
    processed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    __table_args__ = (Index("ix_sync_operations_processed_at", "processed_at"),)
