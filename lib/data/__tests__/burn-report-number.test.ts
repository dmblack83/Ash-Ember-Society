import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeReportNumbers } from "../burn-report-number";

/* ------------------------------------------------------------------
   computeReportNumbers — RPC-first with legacy fallback.

   The fast path calls the get_report_numbers RPC (SQL window
   function). When the RPC is missing (migration not yet applied),
   the legacy two-query path must produce the same map.
   ------------------------------------------------------------------ */

interface LogRow {
  id:        string;
  user_id:   string;
  smoked_at: string;
}

/** Fake client whose rpc() succeeds. from() must never be touched. */
function rpcClient(rows: { smoke_log_id: string; report_number: number | string }[]) {
  const rpc  = vi.fn().mockResolvedValue({ data: rows, error: null });
  const from = vi.fn(() => {
    throw new Error("legacy path must not run when RPC succeeds");
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

/** Fake client whose rpc() errors (function missing) and whose
    from() serves the two legacy queries against `allLogs`. */
function fallbackClient(allLogs: LogRow[]) {
  const rpc = vi.fn().mockResolvedValue({
    data:  null,
    error: { code: "PGRST202", message: "function get_report_numbers does not exist" },
  });
  const from = vi.fn(() => ({
    select: (columns: string) => ({
      in: (column: string, values: string[]) => {
        if (column === "id") {
          // Query 1: resolve ids → owners
          const data = allLogs
            .filter((l) => values.includes(l.id))
            .map((l) => ({ id: l.id, user_id: l.user_id }));
          return Promise.resolve({ data, error: null });
        }
        // Query 2: full history for owners, ordered by smoked_at asc
        return {
          order: () => {
            const data = allLogs
              .filter((l) => values.includes(l.user_id))
              .sort((a, b) => a.smoked_at.localeCompare(b.smoked_at));
            return Promise.resolve({ data, error: null });
          },
        };
      },
    }),
  }));
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

describe("computeReportNumbers", () => {
  test("returns empty map for empty input without touching the client", async () => {
    const { client, rpc, from } = rpcClient([]);

    const result = await computeReportNumbers(client, []);

    expect(result).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  test("uses the get_report_numbers RPC and maps rows to numbers", async () => {
    const { client, rpc } = rpcClient([
      { smoke_log_id: "log-a", report_number: 45 },
      { smoke_log_id: "log-b", report_number: "3" }, // bigint may arrive as string
    ]);

    const result = await computeReportNumbers(client, ["log-a", "log-b"]);

    expect(rpc).toHaveBeenCalledWith("get_report_numbers", {
      p_smoke_log_ids: ["log-a", "log-b"],
    });
    expect(result).toEqual({ "log-a": 45, "log-b": 3 });
  });

  test("falls back to the legacy two-query path when the RPC is missing", async () => {
    // user-1 has three logs; user-2 has one. Positions are 1-indexed
    // per owner ordered by smoked_at ascending.
    const { client, rpc, from } = fallbackClient([
      { id: "u1-first",  user_id: "user-1", smoked_at: "2026-01-01T00:00:00Z" },
      { id: "u1-second", user_id: "user-1", smoked_at: "2026-02-01T00:00:00Z" },
      { id: "u1-third",  user_id: "user-1", smoked_at: "2026-03-01T00:00:00Z" },
      { id: "u2-first",  user_id: "user-2", smoked_at: "2026-01-15T00:00:00Z" },
    ]);

    const result = await computeReportNumbers(client, ["u1-third", "u2-first"]);

    expect(rpc).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("smoke_logs");
    expect(result).toEqual({ "u1-third": 3, "u2-first": 1 });
  });

  test("fallback returns empty map when ids resolve to no owners", async () => {
    const { client } = fallbackClient([]);

    const result = await computeReportNumbers(client, ["missing-id"]);

    expect(result).toEqual({});
  });
});
