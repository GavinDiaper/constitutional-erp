import { AuthorityClient } from "../clients/authorityClient";
import { FoundationErpClient } from "../clients/foundationErpClient";
import { GovernanceClient } from "../clients/governanceClient";

export interface DependencyStatus {
  authorityReady: boolean;
  governanceReady: boolean;
  foundationReachable: boolean;
  ready: boolean;
}

export async function checkDependencies(input: {
  authorityClient: AuthorityClient;
  governanceClient: GovernanceClient;
  foundationClient: FoundationErpClient;
}): Promise<DependencyStatus> {
  const [authorityReady, governanceReady, foundationReachable] = await Promise.all([
    input.authorityClient.health(),
    input.governanceClient.health(),
    input.foundationClient.health()
  ]);

  return {
    authorityReady,
    governanceReady,
    foundationReachable,
    ready: authorityReady && governanceReady && foundationReachable
  };
}
