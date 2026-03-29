export type DomainCode = "o2c" | "p2p" | "r2r" | "h2r";

export type OperationType = "create" | "update" | "transition" | "query";

export type JsonSchema = {
  type: string;
  required?: string[];
  properties?: Record<string, { type?: string; enum?: string[] }>;
};

export interface McpFunction {
  id: string;
  name: string;
  description: string;
  entity: string;
  domain: DomainCode;
  aggregateType: string;
  action: string;
  operationType: OperationType;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  backingRoute: string;
  riskLevel?: "Low" | "Medium" | "High";
  governanceTag?: string;
}

export interface GovernanceAnnotation {
  riskLevel?: "Low" | "Medium" | "High";
  requiredAuthority?: string;
}

export interface ProcessLink {
  rel: string;
  href: string;
  method: string;
  mcpFunctionId: string;
  requiredInput: JsonSchema;
  governance?: GovernanceAnnotation;
}

export interface ProcessStateResponse {
  entity: string;
  id: string;
  state: string;
  attributes: Record<string, unknown>;
  links: ProcessLink[];
}
