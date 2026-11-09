import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/services/db";
import { createTransaction } from "@/services/transactions";
import { pendingOperationsFor, rescheduleOperation } from "@/services/queue";
import { reapplyConflict } from "@/services/conflicts";
import { syncNow } from "@/services/sync";
import type { TransactionInput } from "@/types";

const INPUT: TransactionInput = {
  title: "Sync test coffee",
  amountPaise: 12550,
  type: "expense",
  category: "Food",
  date: "2026-05-15",
  paymentMethod: "UPI",
  notes: "",
};

const SERVER_TIME = "2026-05-15T12:00:00.000Z";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function changesResponse() {
  return {
    server_time: SERVER_TIME,
    transactions: [],
    budgets: [],
    has_more: false,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sync engine", () => {
  it("uploads queued work, marks records synced and pulls changes", async () => {
    const transaction = await createTransaction(INPUT);
    const queued = (await pendingOperationsFor(transaction.id))[0];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/sync/changes")) {
        return jsonResponse(changesResponse());
      }
      const body = JSON.parse(String(init?.body)) as {
        operations: Array<Record<string, unknown> & { operation_id: string; entity_id: string }>;
      };
      return jsonResponse({
        results: body.operations.map((operation) => ({
          operation_id: operation.operation_id,
          entity: operation.entity,
          entity_id: operation.entity_id,
          status: "applied",
          duplicate: false,
          server_version: 1,
          record: {
            ...operation.payload,
            id: operation.entity_id,
            version: 1,
            updated_at: operation.payload.updated_at,
          },
          message: null,
        })),
        server_time: SERVER_TIME,
        applied: body.operations.length,
        duplicates: 0,
        conflicts: 0,
        errors: 0,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    setOnline(true);
    await syncNow();

    expect(await db.syncQueue.count()).toBe(0);
    const stored = await db.transactions.get(transaction.id);
    expect(stored?.syncState).toBe("synced");
    expect(stored?.version).toBe(1);
    expect(stored?.title).toBe("Sync test coffee");

    const syncCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/sync"),
    );
    expect(syncCalls).toHaveLength(1);
    const payload = JSON.parse(String(syncCalls[0][1]?.body));
    expect(payload.operations[0].operation_id).toBe(queued.operationId);
    expect(payload.operations[0].amount_paise).toBeUndefined();
    expect(payload.operations[0].payload.amount_paise).toBe(12550);
    expect(await db.meta.get("lastSyncedAt")).toBeTruthy();
  });

  it("retries with the same operation UUID (idempotent replay)", async () => {
    const transaction = await createTransaction(INPUT);
    const original = (await pendingOperationsFor(transaction.id))[0];

    await rescheduleOperation(original, "Network unreachable");
    const afterFailure = (await pendingOperationsFor(transaction.id))[0];
    expect(afterFailure.operationId).toBe(original.operationId);
    expect(afterFailure.attempts).toBe(1);
    expect(afterFailure.status).toBe("pending");
    expect(afterFailure.nextRetryAt).toBeGreaterThan(Date.now());

    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/sync/changes")) return jsonResponse(changesResponse());
        const body = JSON.parse(String(init?.body)) as {
          operations: Array<Record<string, unknown> & { operation_id: string; entity_id: string }>;
        };
        seen.push(body.operations[0].operation_id);
        return jsonResponse({
          results: body.operations.map((operation) => ({
            operation_id: operation.operation_id,
            entity: operation.entity,
            entity_id: operation.entity_id,
            status: "applied",
            duplicate: false,
            server_version: 1,
            record: { ...operation.payload, id: operation.entity_id, version: 1 },
            message: null,
          })),
          server_time: SERVER_TIME,
          applied: 1,
          duplicates: 0,
          conflicts: 0,
          errors: 0,
        });
      }),
    );

    setOnline(true);
    await syncNow();
    expect(seen).toEqual([original.operationId]);
    expect(await db.syncQueue.count()).toBe(0);
    expect((await db.transactions.get(transaction.id))?.syncState).toBe("synced");
  });

  it("records a conflict, keeps the server copy, and can reapply the local edit", async () => {
    const transaction = await createTransaction(INPUT);
    const queued = (await pendingOperationsFor(transaction.id))[0];
    const serverUpdatedAt = "2026-05-15T13:00:00.000Z";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/sync/changes")) return jsonResponse(changesResponse());
        const body = JSON.parse(String(init?.body)) as {
          operations: Array<Record<string, unknown> & { operation_id: string; entity_id: string }>;
        };
        return jsonResponse({
          results: body.operations.map((operation) => ({
            operation_id: operation.operation_id,
            entity: operation.entity,
            entity_id: operation.entity_id,
            status: "conflict",
            duplicate: false,
            server_version: 2,
            record: {
              ...operation.payload,
              id: operation.entity_id,
              title: "Server version wins",
              amount_paise: 99000,
              version: 2,
              updated_at: serverUpdatedAt,
            },
            message: "Server copy is newer",
          })),
          server_time: SERVER_TIME,
          applied: 0,
          duplicates: 0,
          conflicts: 1,
          errors: 0,
        });
      }),
    );

    setOnline(true);
    await syncNow();

    expect(await db.syncQueue.count()).toBe(0);
    const stored = await db.transactions.get(transaction.id);
    expect(stored?.syncState).toBe("conflict");
    expect(stored?.title).toBe("Server version wins");
    expect(stored?.version).toBe(2);

    const conflicts = await db.conflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].resolved).toBe(0);
    expect(conflicts[0].opType).toBe("CREATE");
    expect(conflicts[0].localPayload.title).toBe("Sync test coffee");
    expect(conflicts[0].serverRecord.title).toBe("Server version wins");

    setOnline(false);
    await reapplyConflict(conflicts[0]);

    const resolved = await db.conflicts.get(conflicts[0].id!);
    expect(resolved?.resolved).toBe(1);
    expect(resolved?.resolution).toBe("local-reapplied");

    const replay = await pendingOperationsFor(transaction.id);
    expect(replay).toHaveLength(1);
    expect(replay[0].opType).toBe("UPDATE");
    expect(replay[0].baseVersion).toBe(2);
    expect(replay[0].payload.title).toBe("Sync test coffee");
    expect(replay[0].payload.amount_paise).toBe(12550);
    expect((await db.transactions.get(transaction.id))?.syncState).toBe("pending");
  });
});
