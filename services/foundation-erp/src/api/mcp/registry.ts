import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { EventActor } from "../../events/eventStore";
import type { McpFunctionDef } from "./catalog";

export type McpToolKind = "read" | "write";

export interface McpToolContext {
  actor?: EventActor;
}

export interface McpStateGuard {
  from: string[];
  to?: string;
}

export interface McpTool extends McpFunctionDef {
  kind: McpToolKind;
  // Preferred way to declare input: validated at invoke time and converted to JSON Schema for tool listings.
  zodSchema?: ZodTypeAny;
  stateGuard?: McpStateGuard;
  handler: (input: Record<string, any>, ctx: McpToolContext) => unknown | Promise<unknown>;
}

// Dispatches by tool name; used while handlers are still being migrated out of the legacy switch.
export type McpFallbackHandler = (name: string, input: Record<string, any>, ctx: McpToolContext) => unknown | Promise<unknown>;

export type McpToolDefinition = Omit<McpTool, "kind" | "handler"> & {
  kind?: McpToolKind;
  handler?: McpTool["handler"];
};

const READ_ACTIONS = new Set(["get", "list", "find", "describe"]);

export function inferKind(action: string | undefined): McpToolKind {
  return action !== undefined && READ_ACTIONS.has(action) ? "read" : "write";
}

export class McpRegistry {
  private readonly tools = new Map<string, McpTool>();

  register(definition: McpToolDefinition, fallbackHandler?: McpFallbackHandler): McpTool {
    if (this.tools.has(definition.name)) {
      throw new Error(`Duplicate MCP tool: ${definition.name}`);
    }
    const handler = definition.handler ?? (fallbackHandler && ((input, ctx) => fallbackHandler(definition.name, input, ctx)));
    if (!handler) {
      throw new Error(`MCP tool ${definition.name} has no handler`);
    }
    const tool: McpTool = {
      ...definition,
      kind: definition.kind ?? inferKind(definition.action),
      handler
    };
    if (tool.zodSchema) {
      tool.inputSchema = toJsonSchema(tool.zodSchema);
    }
    this.tools.set(tool.name, tool);
    return tool;
  }

  get(name: string): McpTool | undefined {
    return this.tools.get(name);
  }

  list(filter: { domain?: string; entity?: string; kind?: McpToolKind } = {}): McpTool[] {
    return [...this.tools.values()].filter(
      (tool) =>
        (!filter.domain || tool.domain === filter.domain) &&
        (!filter.entity || tool.entity?.toLowerCase() === filter.entity.toLowerCase()) &&
        (!filter.kind || tool.kind === filter.kind)
    );
  }

  // Serializable view for GET /functions: handlers and zod objects stay server-side.
  describe(filter: Parameters<McpRegistry["list"]>[0] = {}): McpFunctionDef[] {
    return this.list(filter).map(({ handler: _handler, zodSchema: _zod, ...rest }) => rest);
  }
}

export function toJsonSchema(schema: ZodTypeAny): NonNullable<McpFunctionDef["inputSchema"]> {
  const json = (zodToJsonSchema as (s: unknown, o: unknown) => unknown)(schema, { $refStrategy: "none" }) as Record<string, any>;
  delete json["$schema"];
  return json as NonNullable<McpFunctionDef["inputSchema"]>;
}

export function buildRegistry(definitions: McpToolDefinition[], fallbackHandler?: McpFallbackHandler): McpRegistry {
  const registry = new McpRegistry();
  for (const definition of definitions) {
    registry.register(definition, fallbackHandler);
  }
  return registry;
}
