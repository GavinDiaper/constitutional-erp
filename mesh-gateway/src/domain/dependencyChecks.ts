import { BackendAdapter } from "../adapters/types";
import { AuthorityClient } from "../clients/authorityClient";
import { GovernanceClient } from "../clients/governanceClient";

export interface DependencyStatus {
  authorityReady: boolean;
  governanceReady: boolean;
  adapters: Array<{ id: string; healthy: boolean }>;
  ready: boolean;
}

export async function checkDependencies(input: {
  authorityClient: AuthorityClient;
  governanceClient: GovernanceClient;
  adapters: BackendAdapter[];
}): Promise<DependencyStatus> {
  const [authorityReady, governanceReady] = await Promise.all([
    input.authorityClient.health(),
    input.governanceClient.health()
  ]);

  const adapters = await Promise.all(
    input.adapters.map(async (adapter) => ({
      id: adapter.id,
      healthy: await adapter.health()
    }))
  );

  const atLeastOneAdapterHealthy = adapters.some((adapter) => adapter.healthy);

  return {
    authorityReady,
    governanceReady,
    adapters,
    ready: authorityReady && governanceReady && atLeastOneAdapterHealthy
  };
}
