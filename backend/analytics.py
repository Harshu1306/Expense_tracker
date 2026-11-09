"""Analytics endpoints and the budget-status calculation."""

from __future__ import annotations

import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from crud import find_active_budget, list_budgets
from database import get_db
from models import Budget, Transaction
from schemas import (
    BudgetOut,
    BudgetStatusOut,
    CategoryAnalyticsOut,
    CategoryPoint,
    MonthlyAnalyticsOut,
    MonthlyPoint,
    SummaryOut,
    WeeklyAnalyticsOut,
    WeeklyPoint,
)
from utils import month_bounds, utcnow

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

WARNING_THRESHOLD = 0.8


def _active() -> tuple[int, int]:
    today = utcnow().date()
    return today.month, today.year


def _sum(db: Session, *conditions) -> int:
    stmt = select(func.coalesce(func.sum(Transaction.amount_paise), 0)).where(
        Transaction.deleted_at.is_(None), *conditions
    )
    return int(db.scalar(stmt) or 0)


def budget_state(spent: int, limit: int) -> str:
    if limit <= 0:
        return "none"
    if spent >= limit:
        return "exceeded"
    if spent >= limit * WARNING_THRESHOLD:
        return "warning"
    return "ok"


def _budget_status(db: Session, budget: Budget) -> BudgetStatusOut:
    first, last = month_bounds(budget.year, budget.month)
    conditions = [Transaction.type == "expense", Transaction.date >= first, Transaction.date < last]
    if budget.category != "All":
        conditions.append(Transaction.category == budget.category)
    spent = _sum(db, *conditions)
    remaining = budget.monthly_limit_paise - spent
    percent = round((spent / budget.monthly_limit_paise) * 100, 2)
    return BudgetStatusOut(
        **BudgetOut.model_validate(budget).model_dump(),
        spent_paise=spent,
        remaining_paise=remaining,
        percent_used=percent,
        state=budget_state(spent, budget.monthly_limit_paise),
    )


@router.get("/summary", response_model=SummaryOut, summary="Dashboard totals")
def summary(db: Session = Depends(get_db)) -> SummaryOut:
    month, year = _active()
    first, last = month_bounds(year, month)

    total_income = _sum(db, Transaction.type == "income")
    total_expense = _sum(db, Transaction.type == "expense")
    month_expense = _sum(
        db,
        Transaction.type == "expense",
        Transaction.date >= first,
        Transaction.date < last,
    )
    month_income = _sum(
        db,
        Transaction.type == "income",
        Transaction.date >= first,
        Transaction.date < last,
    )
    count = int(
        db.scalar(
            select(func.count(Transaction.id)).where(Transaction.deleted_at.is_(None))
        )
        or 0
    )

    overall = find_active_budget(db, category="All", month=month, year=year)
    budget_paise = overall.monthly_limit_paise if overall else None
    remaining = budget_paise - month_expense if budget_paise is not None else None
    percent = (
        round((month_expense / budget_paise) * 100, 2)
        if budget_paise
        else 0.0
    )
    state = budget_state(month_expense, budget_paise) if budget_paise else "none"

    return SummaryOut(
        total_balance_paise=total_income - total_expense,
        total_income_paise=total_income,
        total_expense_paise=total_expense,
        this_month_expense_paise=month_expense,
        this_month_income_paise=month_income,
        month=month,
        year=year,
        transaction_count=count,
        budget_paise=budget_paise,
        budget_spent_paise=month_expense,
        budget_remaining_paise=remaining,
        budget_percent_used=percent,
        budget_state=state,
    )


@router.get("/monthly", response_model=MonthlyAnalyticsOut, summary="Income vs expense by month")
def monthly(
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
) -> MonthlyAnalyticsOut:
    today = utcnow().date()
    points: list[MonthlyPoint] = []

    rows = db.execute(
        select(
            func.strftime("%Y", Transaction.date).label("year"),
            func.strftime("%m", Transaction.date).label("month"),
            Transaction.type,
            func.sum(Transaction.amount_paise),
        )
        .where(Transaction.deleted_at.is_(None))
        .group_by("year", "month", Transaction.type)
    ).all()

    lookup: dict[tuple[int, int, str], int] = {}
    for row_year, row_month, row_type, total in rows:
        lookup[(int(row_year), int(row_month), row_type)] = int(total or 0)

    year, month = today.year, today.month
    for _ in range(months):
        points.append(
            MonthlyPoint(
                month=month,
                year=year,
                label=f"{calendar.month_abbr[month]} {year}",
                income_paise=lookup.get((year, month, "income"), 0),
                expense_paise=lookup.get((year, month, "expense"), 0),
            )
        )
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    points.reverse()
    return MonthlyAnalyticsOut(months=points)


@router.get("/categories", response_model=CategoryAnalyticsOut, summary="Expense split by category")
def categories(
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
) -> CategoryAnalyticsOut:
    active_month, active_year = _active()
    month = month or active_month
    year = year or active_year
    first, last = month_bounds(year, month)

    rows = db.execute(
        select(
            Transaction.category,
            func.sum(Transaction.amount_paise),
            func.count(Transaction.id),
        )
        .where(
            Transaction.deleted_at.is_(None),
            Transaction.type == "expense",
            Transaction.date >= first,
            Transaction.date < last,
        )
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount_paise).desc())
    ).all()

    total = sum(int(row[1] or 0) for row in rows)
    points = [
        CategoryPoint(
            category=row[0],
            total_paise=int(row[1] or 0),
            count=int(row[2] or 0),
            percent=round((int(row[1] or 0) / total) * 100, 2) if total else 0.0,
        )
        for row in rows
    ]
    return CategoryAnalyticsOut(month=month, year=year, total_paise=total, categories=points)


@router.get("/weekly", response_model=WeeklyAnalyticsOut, summary="Daily spending for the last 7 days")
def weekly(
    days: int = Query(default=7, ge=1, le=31),
    db: Session = Depends(get_db),
) -> WeeklyAnalyticsOut:
    today = utcnow().date()
    start = today - timedelta(days=days - 1)
    rows = db.execute(
        select(Transaction.date, func.sum(Transaction.amount_paise))
        .where(
            Transaction.deleted_at.is_(None),
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date <= today,
        )
        .group_by(Transaction.date)
    ).all()
    lookup = {row[0]: int(row[1] or 0) for row in rows}

    points: list[WeeklyPoint] = []
    for offset in range(days):
        day: date = start + timedelta(days=offset)
        points.append(
            WeeklyPoint(
                date=day,
                label=day.strftime("%a"),
                expense_paise=lookup.get(day, 0),
            )
        )
    return WeeklyAnalyticsOut(days=points)


@router.get("/budgets", response_model=list[BudgetStatusOut], summary="Budgets with spend status")
def budget_status(
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    db: Session = Depends(get_db),
) -> list[BudgetStatusOut]:
    active_month, active_year = _active()
    month = month or active_month
    year = year or active_year
    return [
        _budget_status(db, budget)
        for budget in list_budgets(db, month=month, year=year)
    ]
