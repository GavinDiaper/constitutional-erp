export interface EventSourceClientConfig {
  baseUrl: string;
  apiKey: string;
  endpointPath?: string;
  ingressIdHeader?: string;
  ingressIdValue?: string;
}

interface EventListResponse {
  data: Array<Record<string, unknown>>;
}

export class EventSourceClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly endpointPath: string;
  private readonly ingressIdHeader?: string;
  private readonly ingressIdValue?: string;

  constructor(config: EventSourceClientConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.endpointPath = config.endpointPath ?? "/api/v1/events";
    this.ingressIdHeader = config.ingressIdHeader;
    this.ingressIdValue = config.ingressIdValue;
  }

  async fetchBatch(after: string | undefined, limit: number): Promise<Array<Record<string, unknown>>> {
    const url = new URL(`${this.baseUrl}${this.endpointPath}`);
    url.searchParams.set("limit", String(limit));
    if (after) {
      url.searchParams.set("after", after);
    }

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey
    };

    if (this.ingressIdHeader && this.ingressIdValue) {
      headers[this.ingressIdHeader] = this.ingressIdValue;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Event fetch failed (${response.status}) from ${url.toString()}: ${body}`);
    }

    const parsed = (await response.json()) as EventListResponse;
    return parsed.data ?? [];
  }
}