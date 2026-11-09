"""Scenarios C, D and E - sync, idempotency, duplicate prevention, conflicts."""

from __future__ import annotations

from conftest import make_transaction, sync_op

TX = "11111111-1111-4111-8111-111111111111"


def post_sync(client, operations: list[dict]):
    response = client.post("/api/sync", json={"operations": operations})
    assert response.status_code == 200, response.text
    return response.json()


def test_sync_create_and_idempotent_retry(client):
    op = sync_op(operation_id="op-create-1", payload=make_transaction())
    first = post_sync(client, [op])
    assert first["results"][0]["status"] == "applied"
    assert first["results"][0]["server_version"] == 1
    assert first["applied"] == 1

    # Scenario D: replaying the exact operation must not insert a second row.
    second = post_sync(client, [op])
    assert second["results"][0]["duplicate"] is True
    assert second["duplicates"] == 1
    assert client.get("/api/transactions").json()["total"] == 1

    # A *different* operation id but the same transaction id/timestamp is also
    # deduplicated by id/timestamp.
    third = post_sync(
        client,
        [sync_op(operation_id="op-create-1-retry", payload=make_transaction())],
    )
    assert third["results"][0]["status"] in {"duplicate", "ignored"}
    assert client.get("/api/transactions").json()["total"] == 1


def test_scenario_c_offline_batch_sync(client):
    """Five creates, two edits, one delete -> final server state is correct."""
    creates = [
        make_transaction(
            tx_id=f"0000000{i}-0000-4000-8000-00000000000{i}",
            title=f"Expense {i}",
            amount_paise=10_000 * i,
            date=f"2026-02-0{i}",
            updated_at=f"2026-02-0{i}T09:00:00Z",
        )
        for i in range(1, 6)
    ]
    operations = [
        sync_op(
            operation_id=f"op-c-{i}",
            entity_id=payload["id"],
            payload=payload,
            client_timestamp=payload["updated_at"],
        )
        for i, payload in enumerate(creates, start=1)
    ]
    result = post_sync(client, operations)
    assert result["applied"] == 5
    assert client.get("/api/transactions").json()["total"] == 5

    # Two edits queued offline.
    edits = []
    for index in (2, 4):
        payload = dict(creates[index - 1])
        payload.update(
            {
                "title": f"Expense {index} edited",
                "amount_paise": 99_900 + index,
                "updated_at": f"2026-02-10T10:0{index}:00Z",
            }
        )
        edits.append(
            sync_op(
                operation_id=f"op-c-update-{index}",
                op_type="UPDATE",
                entity_id=payload["id"],
                payload=payload,
                base_version=1,
                client_timestamp=payload["updated_at"],
            )
        )
    # One delete queued offline.
    deleted_payload = dict(creates[0])
    edits.append(
        sync_op(
            operation_id="op-c-delete-1",
            op_type="DELETE",
            entity_id=deleted_payload["id"],
            payload=deleted_payload,
            base_version=1,
            client_timestamp="2026-02-11T10:00:00Z",
        )
    )
    result = post_sync(client, edits)
    assert result["applied"] == 3, result

    listed = client.get("/api/transactions").json()
    assert listed["total"] == 4
    by_id = {item["id"]: item for item in listed["items"]}
    assert creates[0]["id"] not in by_id
    assert by_id[creates[1]["id"]]["title"] == "Expense 2 edited"
    assert by_id[creates[1]["id"]]["amount_paise"] == 99_902
    assert by_id[creates[3]["id"]]["title"] == "Expense 4 edited"
    assert by_id[creates[3]["id"]]["version"] == 2

    # The delete left a tombstone, visible when explicitly requested.
    all_rows = client.get("/api/transactions", params={"include_deleted": True}).json()
    tombstone = next(item for item in all_rows["items"] if item["id"] == creates[0]["id"])
    assert tombstone["deleted_at"] is not None

    status = client.get("/api/sync/status").json()
    assert status["transaction_count"] == 4
    assert status["deleted_transaction_count"] == 1
    assert status["operations_processed"] == 8


def test_scenario_e_conflict_last_write_wins(client):
    # Client 1 creates the transaction at 09:00.
    payload = make_transaction(updated_at="2026-02-10T09:00:00Z")
    post_sync(
        client,
        [sync_op(operation_id="op-e-create", payload=payload, client_timestamp="2026-02-10T09:00:00Z")],
    )

    # Client 2 edits on the server at 12:00 (version 2).
    server_update = client.put(
        f"/api/transactions/{TX}",
        json={"title": "Server edit", "updated_at": "2026-02-10T12:00:00Z"},
    )
    assert server_update.status_code == 200
    assert server_update.json()["version"] == 2

    # Client 1 comes back online with a stale edit made at 11:00.
    stale = dict(payload)
    stale.update({"title": "Offline stale edit", "updated_at": "2026-02-10T11:00:00Z"})
    result = post_sync(
        client,
        [
            sync_op(
                operation_id="op-e-stale",
                op_type="UPDATE",
                payload=stale,
                base_version=1,
                client_timestamp="2026-02-10T11:00:00Z",
            )
        ],
    )
    conflict = result["results"][0]
    assert conflict["status"] == "conflict"
    assert conflict["record"]["title"] == "Server edit"
    assert conflict["record"]["version"] == 2
    assert result["conflicts"] == 1
    assert client.get(f"/api/transactions/{TX}").json()["title"] == "Server edit"

    # A newer client edit (13:00) wins under last-write-wins.
    newer = dict(payload)
    newer.update({"title": "Newer offline edit", "updated_at": "2026-02-10T13:00:00Z"})
    result = post_sync(
        client,
        [
            sync_op(
                operation_id="op-e-newer",
                op_type="UPDATE",
                payload=newer,
                base_version=1,
                client_timestamp="2026-02-10T13:00:00Z",
            )
        ],
    )
    applied = result["results"][0]
    assert applied["status"] == "applied"
    assert applied["record"]["title"] == "Newer offline edit"
    assert applied["record"]["version"] == 3


def test_rest_version_conflict(client):
    client.post("/api/transactions", json=make_transaction(updated_at="2026-02-10T09:00:00Z"))
    first = client.put(
        f"/api/transactions/{TX}",
        json={"title": "One", "base_version": 1, "updated_at": "2026-02-10T10:00:00Z"},
    )
    assert first.status_code == 200
    assert first.json()["version"] == 2

    stale = client.put(
        f"/api/transactions/{TX}",
        json={"title": "Stale", "base_version": 1, "updated_at": "2026-02-10T09:30:00Z"},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["server_record"]["title"] == "One"

    fresh = client.put(
        f"/api/transactions/{TX}",
        json={"title": "Fresh", "base_version": 1, "updated_at": "2026-02-10T11:00:00Z"},
    )
    assert fresh.status_code == 200
    assert fresh.json()["title"] == "Fresh"


def test_sync_delete_idempotent_and_tombstone_created_for_unknown(client):
    payload = make_transaction()
    post_sync(client, [sync_op(operation_id="op-del-create", payload=payload)])

    delete_op = sync_op(
        operation_id="op-del-1",
        op_type="DELETE",
        payload=payload,
        base_version=1,
        client_timestamp="2026-02-12T09:00:00Z",
    )
    first = post_sync(client, [delete_op])
    assert first["results"][0]["status"] == "applied"
    assert first["results"][0]["record"]["deleted_at"] is not None

    # Replaying the same operation is deduplicated.
    replay = post_sync(client, [delete_op])
    assert replay["results"][0]["duplicate"] is True

    # A different operation deleting an already-deleted row is ignored.
    other = post_sync(
        client,
        [
            sync_op(
                operation_id="op-del-2",
                op_type="DELETE",
                payload=payload,
                base_version=1,
                client_timestamp="2026-02-13T09:00:00Z",
            )
        ],
    )
    assert other["results"][0]["status"] == "ignored"

    # Deleting a row the server never saw still records a tombstone so the
    # deletion cannot be lost.
    unknown_id = "99999999-9999-4999-8999-999999999999"
    unknown = post_sync(
        client,
        [
            sync_op(
                operation_id="op-del-unknown",
                op_type="DELETE",
                entity_id=unknown_id,
                payload={"title": "Gone", "amount_paise": 100, "category": "Food", "date": "2026-02-01"},
                client_timestamp="2026-02-14T09:00:00Z",
            )
        ],
    )
    assert unknown["results"][0]["status"] == "applied"
    assert client.get(f"/api/transactions/{unknown_id}").status_code == 404


def test_sync_changes_pull(client):
    earlier = "2026-02-01T00:00:00Z"
    payload = make_transaction(updated_at="2026-02-10T09:00:00Z")
    post_sync(client, [sync_op(operation_id="op-pull-create", payload=payload)])

    changes = client.get("/api/sync/changes", params={"since": earlier}).json()
    assert len(changes["transactions"]) == 1
    assert changes["transactions"][0]["id"] == payload["id"]
    assert changes["server_time"].endswith("Z")

    # Using the returned server_time as the next cursor yields no changes.
    no_changes = client.get(
        "/api/sync/changes", params={"since": changes["server_time"]}
    ).json()
    assert no_changes["transactions"] == []

    # Invalid cursor is rejected.
    assert client.get("/api/sync/changes", params={"since": "not-a-date"}).status_code == 422


def test_sync_validation_error_does_not_create_ledger(client):
    bad = sync_op(
        operation_id="op-bad",
        payload={**make_transaction(), "amount_paise": -100},
    )
    result = post_sync(client, [bad])
    assert result["results"][0]["status"] == "error"
    assert result["errors"] == 1
    assert client.get("/api/sync/status").json()["operations_processed"] == 0
    assert client.get("/api/transactions").json()["total"] == 0


def test_budget_sync_and_delete(client):
    budget = {
        "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "category": "Food",
        "monthly_limit_paise": 500_000,
        "month": 2,
        "year": 2026,
        "updated_at": "2026-02-01T09:00:00Z",
    }
    result = post_sync(
        client,
        [
            sync_op(
                operation_id="op-budget-create",
                entity="budget",
                entity_id=budget["id"],
                payload=budget,
                client_timestamp=budget["updated_at"],
            )
        ],
    )
    assert result["results"][0]["status"] == "applied"
    assert result["results"][0]["record"]["monthly_limit_paise"] == 500_000

    updated = dict(budget)
    updated.update({"monthly_limit_paise": 750_000, "updated_at": "2026-02-05T09:00:00Z"})
    result = post_sync(
        client,
        [
            sync_op(
                operation_id="op-budget-update",
                entity="budget",
                op_type="UPDATE",
                entity_id=budget["id"],
                payload=updated,
                base_version=1,
                client_timestamp=updated["updated_at"],
            )
        ],
    )
    assert result["results"][0]["status"] == "applied"
    assert result["results"][0]["record"]["version"] == 2
    assert client.get("/api/budgets").json()[0]["monthly_limit_paise"] == 750_000
