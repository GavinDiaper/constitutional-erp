import { http } from "./http";

export interface GovernanceAnnotation {
  riskLevel?: "Low" | "Medium" | "High";
  requiredTier?: number;
  governanceTag?: string;
}

export interface ProcessLink {
  rel: string;
  href: string;
  method: string;
  mcpFunctionId: string;
  requiredInput: { type: string; required?: string[]; properties?: Record<string, unknown> };
  governance?: GovernanceAnnotation;
}

export interface ProcessState {
  entity: string;
  id: string;
  state: string;
  attributes: Record<string, unknown>;
  links: ProcessLink[];
}

export async function getProcessState(
  entityType: string,
  entityId: string
): Promise<ProcessState> {
  return http<ProcessState>(
    `/process/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`
  );
}
