import { http } from "./http";

export interface QueryTableInfo {
  name: string;
  primaryKey: string;
}

export interface QueryTablesResponse {
  data: QueryTableInfo[];
}

export interface QueryRowsResponse {
  data: Record<string, unknown>[];
  table: string;
  paging: {
    limit: number;
    offset: number;
    count: number;
  };
}

export async function listQueryTables(): Promise<QueryTableInfo[]> {
  const result = await http<QueryTablesResponse>("/api/v1/query/tables");
  return result.data;
}

export async function listTableRows(
  table: string,
  limit = 50,
  offset = 0
): Promise<QueryRowsResponse> {
  return http<QueryRowsResponse>(
    `/api/v1/query/${encodeURIComponent(table)}?limit=${encodeURIComponent(
      String(limit)
    )}&offset=${encodeURIComponent(String(offset))}`
  );
}
