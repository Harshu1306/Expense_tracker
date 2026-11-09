"""SpendWise FastAPI application.

Run from the ``backend`` directory:

    python -m uvicorn main:app --reload --port 8000

Swagger UI: http://localhost:8000/api/docs
"""

from __future__ import annotations

import os
import uuid
from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import analytics
import crud
import sync
from database import DATABASE_URL, get_db, init_db
from schemas import (
    BudgetCreate,
    BudgetOut,
    BudgetUpdate,
    HealthOut,
    TransactionCreate,
    TransactionListOut,
    TransactionOut,
    TransactionUpdate,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="SpendWise API",
    description=(
        "Offline-first daily expense tracker API. Money is stored as integer "
        "paise; deletes are tombstones; sync writes are idempotent and use a "
        "documented last-write-wins policy."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

_origins = os.getenv(
    "SPENDWISE_CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,"
    "http://127.0.0.1:3001,https://expensetracker-21fz.vercel.app,"
    "capacitor://localhost,http://localhost,https://localhost",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sync.router)
app.include_router(analytics.router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "message": "Request validation failed",
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request, exc: Exception):
    # Do not leak exception text: database errors can contain connection details.
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/", tags=["meta"], summary="API index")
def index() -> dict:
    return {
        "name": "SpendWise API",
        "version": "1.0.0",
        "docs": "/api/docs",
        "openapi": "/api/openapi.json",
    }


@app.get("/api/health", response_model=HealthOut, tags=["meta"], summary="Health check")
def health() -> HealthOut:
    # Never return DATABASE_URL: for PostgreSQL it contains the password.
    kind = "sqlite" if DATABASE_URL.startswith("sqlite") else "postgresql"
    return HealthOut(status="ok", database=kind)


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
@app.get(
    "/api/transactions",
    response_model=TransactionListOut,
    tags=["transactions"],
    summary="List / search transactions",
)
def get_transactions(
    q: str | None = Query(default=None, description="Search title, notes or category"),
    type: str | None = Query(default=None, pattern="^(income|expense)$"),
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    include_deleted: bool = False,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    sort: str = Query(default="date_desc"),
    db: Session = Depends(get_db),
) -> TransactionListOut:
    items, total = crud.list_transactions(
        db,
        q=q,
        type=type,
        category=category,
        start_date=start_date,
        end_date=end_date,
        month=month,
        year=year,
        include_deleted=include_deleted,
        limit=limit,
        offset=offset,
        sort=sort,
    )
    return TransactionListOut(
        items=[TransactionOut.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@app.post(
    "/api/transactions",
    response_model=TransactionOut,
    status_code=status.HTTP_201_CREATED,
    tags=["transactions"],
    summary="Create a transaction",
)
def create_transaction(
    payload: TransactionCreate,
    response: Response,
    db: Session = Depends(get_db),
) -> TransactionOut:
    if payload.id is None:
        payload = payload.model_copy(update={"id": str(uuid.uuid4())})
    outcome = crud.upsert_transaction(db, payload, is_create=True)
    if outcome.status == "conflict":
        raise HTTPException(
            status_code=409,
            detail={
                "message": outcome.message,
                "server_record": crud.transaction_dict(outcome.record),
            },
        )
    if outcome.status == "duplicate":
        response.status_code = status.HTTP_200_OK
    return TransactionOut.model_validate(outcome.record)


@app.get(
    "/api/transactions/{transaction_id}",
    response_model=TransactionOut,
    tags=["transactions"],
    summary="Get one transaction",
)
def get_transaction(transaction_id: str, db: Session = Depends(get_db)) -> TransactionOut:
    transaction = crud.get_transaction(db, transaction_id)
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return TransactionOut.model_validate(transaction)


@app.put(
    "/api/transactions/{transaction_id}",
    response_model=TransactionOut,
    tags=["transactions"],
    summary="Update a transaction (last-write-wins)",
)
def update_transaction(
    transaction_id: str,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
) -> TransactionOut:
    outcome = crud.update_transaction(
        db, transaction_id, payload, base_version=payload.base_version
    )
    if outcome.status == "not_found":
        raise HTTPException(status_code=404, detail="Transaction not found")
    if outcome.status == "conflict":
        raise HTTPException(
            status_code=409,
            detail={
                "message": outcome.message,
                "server_record": crud.transaction_dict(outcome.record),
            },
        )
    return TransactionOut.model_validate(outcome.record)


@app.delete(
    "/api/transactions/{transaction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["transactions"],
    summary="Soft-delete a transaction (tombstone)",
)
def delete_transaction(
    transaction_id: str,
    db: Session = Depends(get_db),
) -> Response:
    outcome = crud.delete_transaction(db, transaction_id)
    if outcome.status == "not_found":
        raise HTTPException(status_code=404, detail="Transaction not found")
    if outcome.status == "conflict":
        raise HTTPException(
            status_code=409,
            detail={
                "message": outcome.message,
                "server_record": crud.transaction_dict(outcome.record),
            },
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Budgets
# ---------------------------------------------------------------------------
@app.get(
    "/api/budgets",
    response_model=list[BudgetOut],
    tags=["budgets"],
    summary="List budgets",
)
def get_budgets(
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    include_deleted: bool = False,
    db: Session = Depends(get_db),
) -> list[BudgetOut]:
    budgets = crud.list_budgets(
        db, month=month, year=year, include_deleted=include_deleted
    )
    return [BudgetOut.model_validate(budget) for budget in budgets]


@app.post(
    "/api/budgets",
    response_model=BudgetOut,
    status_code=status.HTTP_201_CREATED,
    tags=["budgets"],
    summary="Create a monthly budget",
)
def create_budget(
    payload: BudgetCreate,
    response: Response,
    db: Session = Depends(get_db),
) -> BudgetOut:
    if payload.id is None:
        payload = payload.model_copy(update={"id": str(uuid.uuid4())})
    outcome = crud.upsert_budget(db, payload, is_create=True)
    if outcome.status == "conflict":
        raise HTTPException(
            status_code=409,
            detail={
                "message": outcome.message,
                "server_record": crud.budget_dict(outcome.record),
            },
        )
    if outcome.status in {"duplicate", "ignored"}:
        response.status_code = status.HTTP_200_OK
    return BudgetOut.model_validate(outcome.record)


@app.put(
    "/api/budgets/{budget_id}",
    response_model=BudgetOut,
    tags=["budgets"],
    summary="Update a monthly budget (last-write-wins)",
)
def update_budget(
    budget_id: str,
    payload: BudgetUpdate,
    db: Session = Depends(get_db),
) -> BudgetOut:
    outcome = crud.update_budget(db, budget_id, payload, base_version=payload.base_version)
    if outcome.status == "not_found":
        raise HTTPException(status_code=404, detail="Budget not found")
    if outcome.status == "conflict":
        raise HTTPException(
            status_code=409,
            detail={
                "message": outcome.message,
                "server_record": crud.budget_dict(outcome.record),
            },
        )
    return BudgetOut.model_validate(outcome.record)


@app.delete(
    "/api/budgets/{budget_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["budgets"],
    summary="Soft-delete a budget (tombstone)",
)
def delete_budget(budget_id: str, db: Session = Depends(get_db)) -> Response:
    outcome = crud.delete_budget(db, budget_id)
    if outcome.status == "conflict":
        raise HTTPException(
            status_code=409,
            detail={
                "message": outcome.message,
                "server_record": crud.budget_dict(outcome.record),
            },
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)