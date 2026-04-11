export interface GovernanceAnnotation {
  riskLevel?: "Low" | "Medium" | "High";
  requiredAuthority?: string; // e.g., "PO.Approver" or "T2" for tier 2+
  requiredTier?: 1 | 2 | 3 | 4 | 5; // Unified authority tier requirement
}

export interface LinkDef {
  href: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  mcpFunction?: string;
  governance?: GovernanceAnnotation;
  simulationHint?: string; // Hint for Navigator about likely outcome (e.g., "Requires inventory; may fail if out of stock")
}

export function entityWithLinks<T extends Record<string, unknown>>(
  entity: T,
  links: Record<string, LinkDef>
): T & { _links: Record<string, LinkDef> } {
  return { ...entity, _links: links };
}
