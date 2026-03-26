import { AppConfig } from "../config/env";
import { requestJsonAllowError, requestJson } from "./http";

export class FoundationErpClient {
  constructor(private readonly config: AppConfig) {}

  private headers() {
    return {
      "content-type": "application/json",
      "x-api-key": this.config.foundationErpApiKey,
      [this.config.foundationErpIngressIdHeader]: this.config.foundationErpIngressId
    };
  }

  async getResource(path: string): Promise<{ status: number; data: Record<string, unknown> }> {
    return requestJson<Record<string, unknown>>(`${this.config.foundationErpUrl}${path}`, {
      method: "GET",
      headers: this.headers()
    });
  }

  async postAction(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
    return requestJsonAllowError<unknown>(`${this.config.foundationErpUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body ?? {})
    });
  }

  async health(): Promise<boolean> {
    const response = await fetch(`${this.config.foundationErpUrl}/health`);
    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { status?: string };
    return payload.status === "ok";
  }
}
