import { PgeResource } from "../clients/pgeClient";
import { GovernanceFacade } from "./governanceFacade";
import { McpCatalog } from "./mcpCatalog";
import { ProcessLink } from "./types";

export class HypermediaBuilder {
  constructor(
    private readonly catalog: McpCatalog,
    private readonly governance: GovernanceFacade
  ) {}

  build(input: { entity: string; id: string; resource: PgeResource }): ProcessLink[] {
    const links: ProcessLink[] = [];

    for (const [action, link] of Object.entries(input.resource.links ?? {})) {
      if (action === "self") {
        continue;
      }

      const functionDef = this.catalog.getByDomainAggregateAction(input.resource.domain as any, input.resource.type, action);
      if (!functionDef) {
        continue;
      }

      links.push({
        rel: action,
        href: `/process/${input.entity}/${input.id}/actions/${action}`,
        method: link.method?.toUpperCase?.() === "POST" ? "POST" : "POST",
        mcpFunctionId: functionDef.id,
        requiredInput: functionDef.inputSchema,
        governance: this.governance.annotate(functionDef.id)
      });
    }

    return links;
  }
}
