"""Scenario A - online CRUD, analytics and SQLite persistence."""

from __future__ import annotations

import sqlite3

from conftest import make_transaction


def test_health_and_openapi(client):
    assert client.get("/api/health").json()["status"] == "ok"
    openapi = client.get("/openapi.json").json()
    assert "/api/transactions" in openapi["paths"]
    assert "/api/sync" in openapi["paths"]


def test_create_read_update_delete_transaction(client, db_path):
    income = client.post(
        "/api/transactions",
        json=make_transaction(
            tx_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            title="Salary",
            amount_paise=5_000_000,
            type_="income",
            category="Others",
            date="2026-02-01",
            updated_at="2026-02-01T08:00:00Z",
        ),
    )
    assert income.status_code == 201, income.text
    created = income.json()
    assert created["amount_paise"] == 5_000_000
    assert created["version"] == 1
    assert created["updated_at"].endswith("Z")

    expense = client.post(
        "/api/transactions",
        json=make_transaction(title="Groceries", amount_paise=123_456),
    )
    assert expense.status_code == 201

    listed = client.get("/api/transactions").json()
    assert listed["total"] == 2
    assert len(listed["items"]) == 2

    fetched = client.get(f"/api/transactions/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "Salary"

    updated = client.put(
        f"/api/transactions/{created['id']}",
        json={"title": "Salary (revised)", "updated_at": "2026-02-02T08:00:00Z"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "Salary (revised)"
    assert updated.json()["version"] == 2

    deleted = client.delete(f"/api/transactions/{created['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/api/transactions/{created['id']}").status_code == 404

    tombstones = client.get(
        "/api/transactions", params={"include_deleted": True}
    ).json()
    tombstone = next(item for item in tombstones["items"] if item["id"] == created["id"])
    assert tombstone["deleted_at"] is not None

    # The rows really are in the SQLite file (not just in memory).
    with sqlite3.connect(db_path) as conn:
        count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        amount = conn.execute(
            "SELECT amount_paise FROM transactions WHERE title = 'Groceries'"
        ).fetchone()[0]
    assert count == 2
    assert amount == 123_456


def test_search_and_filters(client):
    client.post("/api/transactions", json=make_transaction(title="Metro card", category="Transportation", date="2026-02-03", amount_paise=10000))
    client.post("/api/transactions", json=make_transaction(tx_id="22222222-2222-4222-8222-222222222222", title="Pizza night", category="Food", date="2026-02-04", amount_paise=55000))
    client.post("/api/transactions", json=make_transaction(tx_id="33333333-3333-4333-8333-333333333333", title="Freelance", type_="income", category="Others", date="2026-01-20", amount_paise=900000, updated_at="2026-01-20T10:00:00Z"))

    assert client.get("/api/transactions", params={"q": "pizza"}).json()["total"] == 1
    assert client.get("/api/transactions", params={"type": "income"}).json()["total"] == 1
    assert client.get("/api/transactions", params={"category": "Food"}).json()["total"] == 1
    assert (
        client.get(
            "/api/transactions",
            params={"start_date": "2026-02-01", "end_date": "2026-02-28"},
        ).json()["total"]
        == 2
    )
    assert (
        client.get("/api/transactions", params={"month": 1, "year": 2026}).json()["total"]
        == 1
    )


def test_validation_and_errors(client):
    bad_amount = client.post(
        "/api/transactions",
        json={**make_transaction(), "amount_paise": 12.5},
    )
    assert bad_amount.status_code == 422

    negative = client.post(
        "/api/transactions", json={**make_transaction(), "amount_paise": -1}
    )
    assert negative.status_code == 422

    bad_category = client.post(
        "/api/transactions", json={**make_transaction(), "category": "Crypto"}
    )
    assert bad_category.status_code == 422

    assert client.get("/api/transactions/does-not-exist").status_code == 404
    assert (
        client.put(
            "/api/transactions/does-not-exist",
            json={"title": "x", "updated_at": "2026-02-10T09:00:00Z"},
        ).status_code
        == 404
    )


def test_analytics_endpoints(client):
    client.post("/api/transactions", json=make_transaction(tx_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title="Salary", amount_paise=5_000_000, type_="income", category="Others", date="2026-02-01", updated_at="2026-02-01T08:00:00Z"))
    client.post("/api/transactions", json=make_transaction(tx_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title="Rent", amount_paise=1_500_000, category="Bills", date="2026-02-02", updated_at="2026-02-02T08:00:00Z"))
    client.post("/api/transactions", json=make_transaction(tx_id="cccccccc-cccc-4ccc-8ccc-cccccccccccc", title="Lunch", amount_paise=30_000, category="Food", date="2026-02-03", updated_at="2026-02-03T08:00:00Z"))

    summary = client.get("/api/analytics/summary").json()
    assert summary["total_income_paise"] == 5_000_000
    assert summary["total_expense_paise"] == 1_530_000
    assert summary["total_balance_paise"] == 3_470_000
    assert summary["transaction_count"] == 3
    assert summary["currency"] == "INR"

    monthly = client.get("/api/analytics/monthly", params={"months": 3}).json()
    assert len(monthly["months"]) == 3
    assert {"month", "year", "label", "income_paise", "expense_paise"} <= set(
        monthly["months"][0]
    )

    categories = client.get(
        "/api/analytics/categories", params={"month": 2, "year": 2026}
    ).json()
    assert categories["total_paise"] == 1_530_000
    by_name = {point["category"]: point for point in categories["categories"]}
    assert by_name["Bills"]["total_paise"] == 1_500_000
    assert by_name["Food"]["count"] == 1
    assert abs(by_name["Food"]["percent"] - (30_000 / 1_530_000 * 100)) < 0.01

    weekly = client.get("/api/analytics/weekly").json()
    assert len(weekly["days"]) == 7


def test_cors_headers(client):
    response = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
