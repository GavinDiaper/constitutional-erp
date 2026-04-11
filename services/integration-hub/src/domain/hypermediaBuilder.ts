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
    const seenRels = new Set<string>();

    for (const [action, link] of Object.entries(input.resource.links ?? {})) {
      if (action === "self") {
        continue;
      }

      const functionDef = this.catalog.getByDomainAggregateAction(input.resource.domain as any, input.resource.type, action);
      if (!functionDef) {
        continue;
      }

      const rel = this.displayRel(input.resource, action);
      seenRels.add(rel);

      links.push({
        rel,
        href: `/process/${input.entity}/${input.id}/actions/${action}`,
        method: link.method?.toUpperCase?.() === "POST" ? "POST" : "POST",
        mcpFunctionId: functionDef.id,
        requiredInput: functionDef.inputSchema,
        governance: this.governance.annotate(functionDef.id)
      });
    }

    this.appendTransitionFallbackLinks(input, links, seenRels);

    // PGE links only cover state transitions. Add supported update operations
    // so Draft entities can expose line-add actions in Canvas.
    const updateFunctions = this.catalog.listByDomainAggregateAndOperation(
      input.resource.domain,
      input.resource.type,
      "update"
    );

    for (const fn of updateFunctions) {
      if (!this.isUpdateActionAllowed(input.resource, fn.action)) {
        continue;
      }

      const rel = this.displayRel(input.resource, fn.action);
      if (seenRels.has(rel)) {
        continue;
      }

      seenRels.add(rel);
      links.push({
        rel,
        href: `/process/${input.entity}/${input.id}/actions/${fn.action}`,
        method: "POST",
        mcpFunctionId: fn.id,
        requiredInput: fn.inputSchema,
        governance: this.governance.annotate(fn.id)
      });
    }

    return links;
  }

  private appendTransitionFallbackLinks(
    input: { entity: string; id: string; resource: PgeResource },
    links: ProcessLink[],
    seenRels: Set<string>
  ): void {
    const domain = String(input.resource.domain ?? "").toLowerCase();
    const type = String(input.resource.type ?? "").toLowerCase();
    const state = String(input.resource.state ?? "").toLowerCase();

    // Some environments may not emit ar-invoice transition links from PGE.
    // Recover expected Canvas actions from catalog mapping by state.
    if (domain !== "o2c" || type !== "ar-invoice") {
      return;
    }

    const fallbackActions =
      state === "draft"
        ? ["post", "cancel"]
        : state === "posted"
          ? ["cancel"]
          : [];

    for (const action of fallbackActions) {
      const rel = this.displayRel(input.resource, action);
      if (seenRels.has(rel)) {
        continue;
      }

      const functionDef = this.catalog.getByDomainAggregateAction(input.resource.domain as any, input.resource.type, action);
      if (!functionDef) {
        continue;
      }

      seenRels.add(rel);
      links.push({
        rel,
        href: `/process/${input.entity}/${input.id}/actions/${action}`,
        method: "POST",
        mcpFunctionId: functionDef.id,
        requiredInput: functionDef.inputSchema,
        governance: this.governance.annotate(functionDef.id)
      });
    }
  }

  private isUpdateActionAllowed(resource: PgeResource, action: string): boolean {
    const normalizedState = String(resource.state ?? "").trim().toLowerCase();
    const normalizedAction = action.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

    if (normalizedAction === "lines") {
      return normalizedState === "draft";
    }

    return true;
  }

  private displayRel(resource: PgeResource, action: string): string {
    if (action === "lines") {
      return "add-line";
    }

    if (resource.domain.toLowerCase() === "p2p" && resource.type === "purchase-order" && action === "issue") {
      return "approve";
    }

    return action;
  }
}
