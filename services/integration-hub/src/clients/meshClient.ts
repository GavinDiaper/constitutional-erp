import { AppConfig } from "../config/env";
import { HttpError } from "../utils/errors";
import { requestJsonAllowError } from "./http";

export class MeshClient {
  constructor(private readonly config: AppConfig) {}

  async execute(
    backingRoute: string,
    payload: Record<string, unknown>,
    actorId?: string,
    authorization?: string
  ): Promise<Record<string, unknown>> {
    const url = `${this.config.meshGatewayUrl}${backingRoute}`;
    const result = await requestJsonAllowError<Record<string, unknown>>(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.meshGatewayApiKey,
        ...(authorization ? { authorization } : {}),
        ...(actorId ? { "x-actor-id": actorId } : {})
      },
      body: JSON.stringify(payload)
    });

    if (result.status >= 400) {
      const rawDetail = result.data?.["detail"];

      let detail = "";
      if (typeof rawDetail === "string") {
        detail = rawDetail;
      } else if (rawDetail !== undefined) {
        detail = JSON.stringify(rawDetail);
      } else if (result.data && typeof result.data === "object") {
        detail = JSON.stringify(result.data);
      }

      const message = detail
        ? `Mesh route failed: ${backingRoute} Detail ${detail} Status ${result.status}`
        : `Mesh route failed: ${backingRoute} Status ${result.status}`;

      throw new HttpError(result.status, "mesh_execution_failed", message);
    }

    return result.data ?? {};
  }
}
