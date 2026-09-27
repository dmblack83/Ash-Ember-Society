import { describe, it, expect, vi } from "vitest";
import { createMgmtClient, MgmtApiError, DEFAULT_PROJECT_REF } from "../mgmt-client";

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createMgmtClient", () => {
  it("posts the SQL to the project's query endpoint with the bearer token", async () => {
    const fetchImpl = vi.fn(async () => ok([{ n: 1 }]));
    const client = createMgmtClient({ token: "sbp_test", fetchImpl: fetchImpl as unknown as typeof fetch });
    const rows = await client.query<{ n: number }>("select 1 as n");
    expect(rows).toEqual([{ n: 1 }]);
    const [url, init] = (fetchImpl.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).toBe(`https://api.supabase.com/v1/projects/${DEFAULT_PROJECT_REF}/database/query`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sbp_test");
    expect(JSON.parse(init.body as string)).toEqual({ query: "select 1 as n" });
  });
  it("uses an explicit project ref", async () => {
    const fetchImpl = vi.fn(async () => ok([]));
    await createMgmtClient({ token: "t", projectRef: "abc", fetchImpl: fetchImpl as unknown as typeof fetch }).query("select 1");
    expect(((fetchImpl.mock.calls[0] as unknown) as [string])[0]).toContain("/projects/abc/");
  });
  it("throws MgmtApiError with status and body on non-2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("{\"message\":\"bad token\"}", { status: 401 }));
    await expect(createMgmtClient({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch }).query("select 1")).rejects.toMatchObject({ status: 401, body: "{\"message\":\"bad token\"}" });
    await expect(createMgmtClient({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch }).query("select 1")).rejects.toBeInstanceOf(MgmtApiError);
  });
  it("throws when a 200 body is not a JSON array", async () => {
    const fetchImpl = vi.fn(async () => ok({ message: "weird" }));
    await expect(createMgmtClient({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch }).query("select 1")).rejects.toThrow(/not a JSON array/);
    const html = vi.fn(async () => new Response("<html>login</html>", { status: 200 }));
    await expect(createMgmtClient({ token: "t", fetchImpl: html as unknown as typeof fetch }).query("select 1")).rejects.toThrow(/not JSON/);
  });
  it("batch joins statements with newlines and adds no transaction control", async () => {
    const fetchImpl = vi.fn(async () => ok([]));
    await createMgmtClient({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch }).batch(["update a set x = 1;", "delete from b;"]);
    const body = JSON.parse((((fetchImpl.mock.calls[0] as unknown) as [string, RequestInit])[1].body) as string);
    expect(body.query).toBe("update a set x = 1;\ndelete from b;");
    expect(body.query).not.toMatch(/begin|commit/i);
  });
  it("batch refuses an empty statement list", async () => {
    const fetchImpl = vi.fn();
    await expect(createMgmtClient({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch }).batch([])).rejects.toThrow(/empty/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("refuses to construct without a token", () => {
    expect(() => createMgmtClient({ token: "" })).toThrow(/SUPABASE_MGMT_TOKEN/);
  });
});
