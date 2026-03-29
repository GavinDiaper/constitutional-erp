import { AppConfig } from "../config/env";
import { HttpError } from "../utils/errors";
import { requestJsonAllowError } from "./http";

export class MeshClient {
  constructor(private readonly config: AppConfig) {}

  async execute(backingRoute: string, payload: Record<string, unknown>, actorId?: string): Promise<Record<string, unknown>> {
    const url = `${this.config.meshGatewayUrl}${backingRoute}`;
    const result = await requestJsonAllowError<Record<string, unknown>>(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.meshGatewayApiKey,
        ...(actorId ? { "x-actor-id": actorId } : {})
      },
      body: JSON.stringify(payload)
    });

    if (result.status >= 400) {
      const detail = typeof result.data?.["detail"] === "string" ? (result.data["detail"] as string) : `Mesh route failed: ${backingRoute}`;
      throw new HttpError(result.status, "mesh_execution_failed", detail);
    }

    return result.data ?? {};
  }
}
