import { AuthorityDomain, LinkDef } from "../domain/types";

export interface CanonicalResource {
  id: string;
  domain: AuthorityDomain;
  type: string;
  attributes: Record<string, unknown>;
  links: Record<string, LinkDef>;
}

export interface CanonicalActionResult {
  status: number;
  data: unknown;
}

export interface BackendAdapter {
  id: string;
  canHandle(meshPath: string): boolean;
  buildMeshPath(domain: string, resource: string, id: string, action?: string, explicit?: boolean): string;
  fetchResource(meshPath: string, headers: Record<string, string>): Promise<{ status: number; resource: CanonicalResource }>;
  executeAction(meshPath: string, body: unknown, headers: Record<string, string>): Promise<CanonicalActionResult>;
  health(): Promise<boolean>;
}
