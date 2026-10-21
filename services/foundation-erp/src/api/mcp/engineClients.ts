import { loadConfig } from "../../config/env";
import { HttpError } from "../../utils/errors";

type Engine = "authority" | "governance";

// Read-only GET helper for the sibling engines; failures surface as structured MCP errors.
export async function engineGet<T>(engine: Engine, path: string): Promise<T> {
  const config = loadConfig();
  const baseUrl = engine === "authority" ? config.authorityEngineUrl : config.governanceEngineUrl;
  const apiKey = engine === "authority" ? config.authorityEngineApiKey : config.governanceEngineApiKey;
  if (!baseUrl) {
    throw new HttpError(503, "engine_not_configured", `${engine} engine URL is not configured`);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    throw new HttpError(502, "engine_unavailable", `${engine} engine unreachable: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new HttpError(502, "engine_error", `${engine} engine returned ${response.status} for ${path}`);
  }
  return (await response.json()) as T;
}
