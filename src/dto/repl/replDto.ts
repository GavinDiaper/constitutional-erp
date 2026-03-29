/**
 * REPL DTO Layer
 * 
 * Provides annotated schemas for MCP functions with CLI-specific metadata hints.
 * Used to render responses in a format optimized for terminal consumption.
 */

export interface ReplFieldHint {
  required_for_cli: boolean;        // Include in REPL output
  display_priority: number;         // Sort order (1 = highest)
  abbreviation?: string;            // CLI short name (e.g., "qty" instead of "quantity")
  input_validation?: string;        // CLI-specific constraint hint
  hide_if_null?: boolean;          // Don't render if undefined/null
  multi_line?: boolean;             // Render with line breaks (for long text)
}

export interface ReplPropertyDef {
  type: string;
  enum?: string[] | number[];
  pattern?: string;
  [key: string]: any;
  relpHint?: ReplFieldHint;
}

export interface ReplSchema {
  type: "object";
  required?: string[];
  properties: Record<string, ReplPropertyDef>;
}

export interface ReplCommandIO {
  mcp_function_id: string;
  mcp_function_name: string;
  domain: string;
  entity: string;
  action: string;
  risk_level?: "Low" | "Medium" | "High";
  governance_tag?: string;
  input_schema: ReplSchema;
  output_schema: ReplSchema;
  description: string;
}

/**
 * Generates REPL-annotated schemas from MCP function definition
 */
export function annotateForRepl(
  mcpFunctionId: string,
  mcpFunctionName: string,
  domain: string,
  entity: string,
  action: string,
  inputSchema: any,
  outputSchema: any,
  description: string,
  riskLevel?: string,
  governanceTag?: string
): ReplCommandIO {
  // Add display hints to schemas
  const annotatedInput = addDisplayHints(inputSchema);
  const annotatedOutput = addDisplayHints(outputSchema);

  return {
    mcp_function_id: mcpFunctionId,
    mcp_function_name: mcpFunctionName,
    domain,
    entity,
    action,
    risk_level: riskLevel as any,
    governance_tag: governanceTag,
    input_schema: annotatedInput,
    output_schema: annotatedOutput,
    description
  };
}

/**
 * Adds default CLI display hints to schema properties
 */
function addDisplayHints(schema: any): ReplSchema {
  if (!schema.properties) {
    return schema as ReplSchema;
  }

  const properties: Record<string, ReplPropertyDef> = {};
  const requiredFields = schema.required || [];
  
  Object.entries(schema.properties).forEach(([fieldName, defAny], index) => {
    const def = defAny as ReplPropertyDef;
    properties[fieldName] = {
      ...def,
      relpHint: {
        required_for_cli: requiredFields.includes(fieldName),
        display_priority: requiredFields.includes(fieldName) ? index + 1 : 100 + index,
        abbreviation: deriveAbbreviation(fieldName),
        hide_if_null: !requiredFields.includes(fieldName),
      }
    };
  });

  return {
    type: "object",
    required: schema.required,
    properties
  };
}

/**
 * Derives a CLI abbreviation from field name
 * e.g., "quantity" → "qty"
 */
function deriveAbbreviation(fieldName: string): string {
  const abbreviations: Record<string, string> = {
    quantity: "qty",
    description: "desc",
    identifier: "id",
    customerId: "cust_id",
    supplierId: "supp_id",
    purchaseOrderId: "po_id",
    invoiceId: "inv_id",
    department: "dept",
    totalAmount: "total",
    requiredTier: "tier",
  };
  
  return abbreviations[fieldName] || fieldName.substring(0, 3)  .toLowerCase();
}

/**
 * Renders a REPL-annotated object for CLI output
 */
export function renderForCli(obj: Record<string, any>, schema: ReplSchema, maxWidth: number = 80): string {
  const lines: string[] = [];

  // Sort properties by display_priority from schema hints
  const sortedProps = Object.entries(obj)
    .map(([key, value]) => ({
      key,
      value,
      priority: schema.properties[key]?.relpHint?.display_priority || 999,
      hint: schema.properties[key]?.relpHint,
    }))
    .filter(item => !item.hint?.hide_if_null || item.value !== null && item.value !== undefined)
    .sort((a, b) => a.priority - b.priority);

  sortedProps.forEach(({ key, value, hint }) => {
    const displayKey = hint?.abbreviation || key;
    const displayValue = formatValue(value, maxWidth - displayKey.length - 4);
    
    if (hint?.multi_line && Array.isArray(value)) {
      lines.push(`${displayKey}:`);
      value.forEach((item: any, idx: number) => {
        lines.push(`  [${idx}] ${JSON.stringify(item)}`);
      });
    } else {
      lines.push(`${displayKey}: ${displayValue}`);
    }
  });

  return lines.join("\n");
}

function formatValue(value: any, maxLength: number): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.substring(0, maxLength);
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (typeof value === "number") return value.toString();
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === "object") return `{object}`;
  return String(value).substring(0, maxLength);
}

/**
 * Sample REPL DTOs for reference
 */
export const sampleReplDtos = {
  // O2C sample
  o2c_create_customer: annotateForRepl(
    "o2c_create_customer",
    "Create Customer",
    "o2c",
    "Customer",
    "create",
    {
      type: "object",
      required: ["name", "email"],
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        billingAddress: { type: "string" },
      },
    },
    {
      type: "object",
      properties: {
        customerId: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        status: { type: "string" },
      },
    },
    "Create a customer in Draft state",
    "Low",
    "O2C.Customer.Create"
  ),

  // P2P sample
  p2p_approve_po: annotateForRepl(
    "p2p_approve_po",
    "Approve PO",
    "p2p",
    "PurchaseOrder",
    "approve",
    {
      type: "object",
      required: ["poId"],
      properties: {
        poId: { type: "string" },
      },
    },
    {
      type: "object",
      properties: {
        poId: { type: "string" },
        status: { type: "string" },
        totalAmount: { type: "number" },
      },
    },
    "Approve a Draft purchase order",
    "High",
    "P2P.PO.Approve"
  ),
};
