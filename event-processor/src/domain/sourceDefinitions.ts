import { authorityAdapter } from "../adapters/authorityAdapter";
import { foundationAdapter } from "../adapters/foundationAdapter";
import { governanceAdapter } from "../adapters/governanceAdapter";
import { meshAdapter } from "../adapters/meshAdapter";
import { SourceAdapter } from "../adapters/types";
import { EventSourceClient } from "../clients/eventSourceClient";
import { CanonicalSourceSystem } from "../contracts/canonicalEvents";
import { AppConfig } from "../config/env";

export interface SourceDefinition {
  sourceSystem: CanonicalSourceSystem;
  client: EventSourceClient;
  adapter: SourceAdapter;
}

export function createSourceDefinitions(config: AppConfig): SourceDefinition[] {
  return [
    {
      sourceSystem: "foundation-erp",
      client: new EventSourceClient({
        baseUrl: config.foundationErpUrl,
        apiKey: config.foundationErpApiKey,
        ingressIdHeader: config.foundationErpIngressIdHeader,
        ingressIdValue: config.foundationErpIngressId
      }),
      adapter: foundationAdapter
    },
    {
      sourceSystem: "mesh-gateway",
      client: new EventSourceClient({
        baseUrl: config.meshGatewayUrl,
        apiKey: config.meshGatewayApiKey
      }),
      adapter: meshAdapter
    },
    {
      sourceSystem: "authority-engine",
      client: new EventSourceClient({
        baseUrl: config.authorityEngineUrl,
        apiKey: config.authorityEngineApiKey
      }),
      adapter: authorityAdapter
    },
    {
      sourceSystem: "governance-engine",
      client: new EventSourceClient({
        baseUrl: config.governanceEngineUrl,
        apiKey: config.governanceEngineApiKey
      }),
      adapter: governanceAdapter
    }
  ];
}