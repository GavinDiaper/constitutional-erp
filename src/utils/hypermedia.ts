export interface LinkDef {
  href: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  mcpFunction?: string;
}

export function entityWithLinks<T extends Record<string, unknown>>(
  entity: T,
  links: Record<string, LinkDef>
): T & { _links: Record<string, LinkDef> } {
  return { ...entity, _links: links };
}
