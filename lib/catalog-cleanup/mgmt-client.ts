export const DEFAULT_PROJECT_REF = "qagaiuibtwuhihukghyx";

export class MgmtApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Management API ${status}: ${body.slice(0, 500)}`);
    this.name = "MgmtApiError";
  }
}

export interface MgmtClient {
  projectRef: string;
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  /** One request, many statements, no transaction control: Postgres runs the
   *  whole simple-query message as one implicit transaction. */
  batch(statements: string[]): Promise<void>;
}

export function createMgmtClient(opts: { token: string; projectRef?: string; fetchImpl?: typeof fetch }): MgmtClient {
  if (!opts.token) throw new Error("SUPABASE_MGMT_TOKEN is required (mint at supabase.com/dashboard/account/tokens)");
  const projectRef = opts.projectRef || DEFAULT_PROJECT_REF;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  async function query<T>(sql: string): Promise<T[]> {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (!res.ok) throw new MgmtApiError(res.status, text);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error(`Management API returned 200 but the body is not JSON: ${text.slice(0, 200)}`); }
    if (!Array.isArray(parsed)) throw new Error(`Management API returned 200 but the body is not a JSON array: ${text.slice(0, 200)}`);
    return parsed as T[];
  }

  return {
    projectRef,
    query,
    async batch(statements) {
      if (statements.length === 0) throw new Error("batch: empty statement list");
      await query(statements.join("\n"));
    },
  };
}
