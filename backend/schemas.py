"""Pydantic v2 request/response schemas.

Money crosses the API as integer paise (never floats).  Timestamps are
serialised as ISO-8601 UTC strings with a ``Z`` suffix.
"""

from __future__ import annotations

import uuid
from datetime import date as date_type, datetime
from typing import Annotated, Any, Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    field_validator,
)

from utils import iso_utc

CATEGORIES: tuple[str, ...] = (
    "Food",
    "Transportation",
    "Shopping",
    "Education",
    "Entertainment",
    "Healthcare",
    "Bills",
    "Travel",
    "Personal",
    "Others",
)

PAYMENT_METHODS: tuple[str, ...] = (
    "Cash",
    "UPI",
    "Credit Card",
    "Debit Card",
    "Net Banking",
    "Wallet",
    "Other",
)

TransactionType = Literal["income", "expense"]
CategoryName = Literal[
    "Food",
    "Transportation",
    "Shopping",
    "Education",
    "Entertainment",
    "Healthcare",
    "Bills",
    "Travel",
    "Personal",
    "Others",
]

UTCDateTime = Annotated[
    datetime,
    PlainSerializer(iso_utc, return_type=str, when_used="json"),
]
OptionalUTCDateTime = Annotated[
    Optional[datetime],
    PlainSerializer(iso_utc, return_type=Optional[str], when_used="json"),
]


def _validate_uuid(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError) as exc:  # pragma: no cover - defensive
        raise ValueError("id must be a valid UUID") from exc


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
class TransactionBase(APIModel):
    title: str = Field(min_length=1, max_length=200)
    amount_paise: int = Field(gt=0, le=10**15)
    type: TransactionType
    category: CategoryName
    date: date_type
    payment_method: str = Field(default="Cash", min_length=1, max_length=40)
    notes: str | None = Field(default=None, max_length=2000)


class TransactionCreate(TransactionBase):
    id: str | None = None
    created_at: OptionalUTCDateTime = None
    updated_at: OptionalUTCDateTime = None
    version: int | None = Field(default=None, ge=0)

    _id_is_uuid = field_validator("id")(_validate_uuid)


class TransactionUpdate(APIModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    amount_paise: int | None = Field(default=None, gt=0, le=10**15)
    type: TransactionType | None = None
    category: CategoryName | None = None
    date: date_type | None = None
    payment_method: str | None = Field(default=None, min_length=1, max_length=40)
    notes: str | None = Field(default=None, max_length=2000)
    updated_at: OptionalUTCDateTime = None
    # Optional optimistic-concurrency check for the plain REST endpoint.
    base_version: int | None = Field(default=None, ge=0)


class TransactionOut(TransactionBase):
    id: str
    created_at: UTCDateTime
    updated_at: UTCDateTime
    version: int
    deleted_at: OptionalUTCDateTime = None


class TransactionListOut(APIModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# Budgets
# ---------------------------------------------------------------------------
class BudgetBase(APIModel):
    category: str = Field(default="All", min_length=1, max_length=40)
    monthly_limit_paise: int = Field(gt=0, le=10**15)
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000, le=2100)

    @field_validator("category")
    @classmethod
    def _validate_category(cls, value: str) -> str:
        if value != "All" and value not in CATEGORIES:
            raise ValueError(f"category must be 'All' or one of {', '.join(CATEGORIES)}")
        return value


class BudgetCreate(BudgetBase):
    id: str | None = None
    created_at: OptionalUTCDateTime = None
    updated_at: OptionalUTCDateTime = None
    version: int | None = Field(default=None, ge=0)

    _id_is_uuid = field_validator("id")(_validate_uuid)


class BudgetUpdate(APIModel):
    category: str | None = Field(default=None, min_length=1, max_length=40)
    monthly_limit_paise: int | None = Field(default=None, gt=0, le=10**15)
    month: int | None = Field(default=None, ge=1, le=12)
    year: int | None = Field(default=None, ge=2000, le=2100)
    updated_at: OptionalUTCDateTime = None
    base_version: int | None = Field(default=None, ge=0)

    @field_validator("category")
    @classmethod
    def _validate_category(cls, value: str | None) -> str | None:
        if value is not None and value != "All" and value not in CATEGORIES:
            raise ValueError(f"category must be 'All' or one of {', '.join(CATEGORIES)}")
        return value


class BudgetOut(BudgetBase):
    id: str
    created_at: UTCDateTime
    updated_at: UTCDateTime
    version: int
    deleted_at: OptionalUTCDateTime = None


class BudgetStatusOut(BudgetOut):
    spent_paise: int
    remaining_paise: int
    percent_used: float
    state: Literal["ok", "warning", "exceeded"]


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
class SummaryOut(APIModel):
    currency: Literal["INR"] = "INR"
    total_balance_paise: int
    total_income_paise: int
    total_expense_paise: int
    this_month_expense_paise: int
    this_month_income_paise: int
    month: int
    year: int
    transaction_count: int
    budget_paise: int | None = None
    budget_spent_paise: int = 0
    budget_remaining_paise: int | None = None
    budget_percent_used: float = 0.0
    budget_state: Literal["none", "ok", "warning", "exceeded"] = "none"


class MonthlyPoint(APIModel):
    month: int
    year: int
    label: str
    income_paise: int
    expense_paise: int


class CategoryPoint(APIModel):
    category: str
    total_paise: int
    count: int
    percent: float


class WeeklyPoint(APIModel):
    date: date_type
    label: str
    expense_paise: int


class MonthlyAnalyticsOut(APIModel):
    months: list[MonthlyPoint]


class CategoryAnalyticsOut(APIModel):
    month: int
    year: int
    total_paise: int
    categories: list[CategoryPoint]


class WeeklyAnalyticsOut(APIModel):
    days: list[WeeklyPoint]


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------
SyncEntity = Literal["transaction", "budget"]
SyncOpType = Literal["CREATE", "UPDATE", "DELETE"]
SyncStatus = Literal["applied", "duplicate", "conflict", "ignored", "not_found", "error"]


class SyncOperationIn(APIModel):
    operation_id: str = Field(min_length=1, max_length=64)
    entity: SyncEntity
    op_type: SyncOpType
    entity_id: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)
    base_version: int = Field(default=0, ge=0)
    client_timestamp: OptionalUTCDateTime = None

    _entity_id_is_uuid = field_validator("entity_id")(_validate_uuid)


class SyncRequest(APIModel):
    operations: list[SyncOperationIn] = Field(min_length=1, max_length=200)


class SyncOperationResult(APIModel):
    operation_id: str
    entity: SyncEntity
    entity_id: str
    status: SyncStatus
    duplicate: bool = False
    server_version: int | None = None
    record: dict[str, Any] | None = None
    message: str | None = None


class SyncResponse(APIModel):
    results: list[SyncOperationResult]
    server_time: UTCDateTime
    applied: int
    duplicates: int
    conflicts: int
    errors: int


class SyncStatusOut(APIModel):
    server_time: UTCDateTime
    transaction_count: int
    deleted_transaction_count: int
    budget_count: int
    deleted_budget_count: int
    operations_processed: int
    last_change_at: OptionalUTCDateTime = None


class SyncChangesOut(APIModel):
    server_time: UTCDateTime
    transactions: list[TransactionOut]
    budgets: list[BudgetOut]
    has_more: bool = False


class HealthOut(APIModel):
    status: Literal["ok"]
    service: str = "SpendWise API"
    database: str
