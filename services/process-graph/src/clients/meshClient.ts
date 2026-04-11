import { loadConfig } from "../config/env";

export interface MeshActionInput {
  adapterId: string;
  domain: string;
  resource: string;
  id: string;
  action: string;
  actorId: string;
  payload: Record<string, unknown>;
}

export interface MeshActionResult {
  success: boolean;
  detail?: string;
}

/**
 * Delegates a canonical transition to Mesh Gateway for ERP execution.
 * Only called when MESH_DELEGATION_ENABLED=true and an adapterId is known.
 */
export async function delegateToMesh(input: MeshActionInput): Promise<MeshActionResult> {
  const config = loadConfig();
  const url = `${config.meshGatewayUrl}/mesh/${input.adapterId}/${input.domain}/${input.resource}/${input.id}/${input.action}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": config.meshGatewayApiKey,
      "x-actor-id": input.actorId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input.payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { success: false, detail: `Mesh Gateway returned ${response.status}: ${text}` };
  }

  return { success: true };
}
