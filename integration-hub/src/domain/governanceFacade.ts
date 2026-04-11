import { McpCatalog } from "./mcpCatalog";
import { GovernanceAnnotation } from "./types";

export class GovernanceFacade {
  constructor(private readonly catalog: McpCatalog) {}

  annotate(functionId: string): GovernanceAnnotation {
    const fn = this.catalog.getById(functionId);
    return {
      riskLevel: fn?.riskLevel,
      requiredAuthority: fn?.governanceTag,
      requiredTier: fn?.requiredTier,
      governanceTag: fn?.governanceTag
    };
  }
}
