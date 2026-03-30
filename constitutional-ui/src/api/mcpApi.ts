import { http } from "./http";

export interface McpFunction {
  id: string;
  entity: string;
  action: string;
  riskLevel?: "Low" | "Medium" | "High";
  governanceTag?: string;
  requiredTier?: number;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export async function getMcpFunctions(): Promise<McpFunction[]> {
  return http<McpFunction[]>("/api/v1/hub/mcp/functions");
}

export async function getMcpCatalog(entityType: string): Promise<McpFunction[]> {
  const rows = await getMcpFunctions();
  return rows.filter((fn) => fn.entity === entityType || fn.entity === entityType.replace(/-/g, "_"));
}
