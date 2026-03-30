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
  requiredInput: InputSchema;
  governance?: GovernanceAnnotation;
}

export interface InputSchema {
  type: string;
  required?: string[];
  properties?: Record<string, unknown>;
}

export interface ProcessState {
  entity: string;
  id: string;
  state: string;
  attributes: Record<string, unknown>;
  links: ProcessLink[];
}

export interface ExecuteProcessActionResult {
  action: string;
  previousState: string;
  newState: string;
  output: unknown;
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

export async function executeProcessAction(
  entityType: string,
  entityId: string,
  action: string,
  payload: Record<string, unknown>
): Promise<ExecuteProcessActionResult> {
  return http<ExecuteProcessActionResult>(
    `/process/${encodeURIComponent(entityType)}/${encodeURIComponent(
      entityId
    )}/actions/${encodeURIComponent(action)}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function executeProcessActionByHref(
  href: string,
  payload: Record<string, unknown>
): Promise<ExecuteProcessActionResult> {
  return http<ExecuteProcessActionResult>(href, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
