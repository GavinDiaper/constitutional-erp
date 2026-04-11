import { JsonSchema } from "./types";

export function validateInputAgainstSchema(schema: JsonSchema, payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const required = schema.required ?? [];
  const properties = schema.properties ?? {};

  for (const field of required) {
    if (!(field in payload)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const [name, propertySchema] of Object.entries(properties)) {
    if (!(name in payload)) {
      continue;
    }

    const value = payload[name];
    if (!propertySchema.type) {
      continue;
    }

    if (propertySchema.type === "string" && typeof value !== "string") {
      errors.push(`Invalid type for ${name}: expected string`);
    }

    if (propertySchema.type === "number" && typeof value !== "number") {
      errors.push(`Invalid type for ${name}: expected number`);
    }

    if (propertySchema.type === "boolean" && typeof value !== "boolean") {
      errors.push(`Invalid type for ${name}: expected boolean`);
    }

    if (propertySchema.enum && typeof value === "string" && !propertySchema.enum.includes(value)) {
      errors.push(`Invalid value for ${name}: expected one of ${propertySchema.enum.join(", ")}`);
    }
  }

  return errors;
}
