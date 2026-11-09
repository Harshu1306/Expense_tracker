"""Budget CRUD and 80% / exceeded warning behaviour."""

from __future__ import annotations

from datetime import datetime, timezone

from conftest import make_transaction


def current_period() -> tuple[int, int]:
    today = datetime.now(timezone.utc).date()
    return today.month, today.year


def test_budget_crud_and_status(client):
    month, year = current_period()
    created = client.post(
        "/api/budgets",
        json={
            "category": "All",
            "monthly_limit_paise": 100_000,
            "month": month,
            "year": year,
        },
    )
    assert created.status_code == 201, created.text
    budget = created.json()
    assert budget["monthly_limit_paise"] == 100_000
    assert budget["version"] == 1

    listed = client.get("/api/budgets", params={"month": month, "year": year}).json()
    assert len(listed) == 1

    # 80% spent -> warning
    client.post(
        "/api/transactions",
        json=make_transaction(
            title="Food", amount_paise=80_000, category="Food", date=f"{year}-{month:02d}-05", updated_at=f"{year}-{month:02d}-05T10:00:00Z"
        ),
    )
    status = client.get("/api/analytics/budgets", params={"month": month, "year": year}).json()[0]
    assert status["spent_paise"] == 80_000
    assert status["remaining_paise"] == 20_000
    assert status["percent_used"] == 80.0
    assert status["state"] == "warning"

    # Exceeded
    client.post(
        "/api/transactions",
        json=make_transaction(
            tx_id="22222222-2222-4222-8222-222222222222",
            title="More food",
            amount_paise=30_000,
            category="Food",
            date=f"{year}-{month:02d}-06",
            updated_at=f"{year}-{month:02d}-06T10:00:00Z",
        ),
    )
    status = client.get("/api/analytics/budgets", params={"month": month, "year": year}).json()[0]
    assert status["spent_paise"] == 110_000
    assert status["remaining_paise"] == -10_000
    assert status["state"] == "exceeded"

    summary = client.get("/api/analytics/summary").json()
    assert summary["budget_state"] == "exceeded"
    assert summary["budget_remaining_paise"] == -10_000

    updated = client.put(
        f"/api/budgets/{budget['id']}",
        json={"monthly_limit_paise": 200_000, "updated_at": "2026-02-10T09:00:00Z"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["monthly_limit_paise"] == 200_000
    assert updated.json()["version"] == 2


def test_category_budget_status(client):
    month, year = current_period()
    client.post(
        "/api/budgets",
        json={"category": "Food", "monthly_limit_paise": 50_000, "month": month, "year": year},
    )
    client.post(
        "/api/transactions",
        json=make_transaction(
            title="Food", amount_paise=40_000, category="Food", date=f"{year}-{month:02d}-05", updated_at=f"{year}-{month:02d}-05T10:00:00Z"
        ),
    )
    client.post(
        "/api/transactions",
        json=make_transaction(
            tx_id="33333333-3333-4333-8333-333333333333",
            title="Train",
            amount_paise=40_000,
            category="Transportation",
            date=f"{year}-{month:02d}-06",
            updated_at=f"{year}-{month:02d}-06T10:00:00Z",
        ),
    )
    statuses = client.get("/api/analytics/budgets", params={"month": month, "year": year}).json()
    food = next(item for item in statuses if item["category"] == "Food")
    # Only the Food expense counts against the Food budget.
    assert food["spent_paise"] == 40_000
    assert food["state"] == "warning"
