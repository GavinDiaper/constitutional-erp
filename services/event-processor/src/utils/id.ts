import { randomUUID } from "node:crypto";

export function newId(prefix = "CEP-"): string {
  return `${prefix}${randomUUID()}`;
}