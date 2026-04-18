import { CanonicalEvent, CanonicalSourceSystem } from "../contracts/canonicalEvents";

const entityDomainMap: Record<string, string> = {
  Supplier: "P2P",
  Requisition: "P2P",
  PurchaseOrder: "P2P",
  GoodsReceipt: "P2P",
  SupplierInvoice: "P2P",
  ApPayment: "P2P",
  Customer: "O2C",
  Quote: "O2C",
  SalesOrder: "O2C",
  Invoice: "O2C",
  Payment: "O2C",
  Account: "R2R",
  FiscalYear: "R2R",
  FiscalPeriod: "R2R",
  Journal: "R2R",
  InventorySKU: "INV",
  InventoryOrganization: "INV",
  InventoryMovement: "INV",
  Employee: "H2R",
  Position: "H2R",
  Assignment: "H2R",
  Credential: "H2R"
};

export function asObject(payload: unknown): Record<string, unknown> {
  if (!payload) {
    return {};
  }

  if (typeof payload === "string") {
    return JSON.parse(payload) as Record<string, unknown>;
  }

  if (typeof payload === "object") {
    return payload as Record<string, unknown>;
  }

  return {};
}

export function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

const aggregateTypeByEntityType: Record<string, string> = {
  SalesOrder: "sales-order",
  Invoice: "ar-invoice",
  Payment: "ar-payment",
  PurchaseOrder: "purchase-order",
  GoodsReceipt: "goods-receipt",
  SupplierInvoice: "supplier-invoice",
  ApPayment: "ap-payment",
  FiscalYear: "fiscal-year",
  FiscalPeriod: "fiscal-period",
  AuthorityRule: "authority-rule"
};

export function canonicalAggregateTypeFromEntityType(entityType: string): string {
  return aggregateTypeByEntityType[entityType] ?? toKebabCase(entityType);
}

export function toCanonicalMeshEventType(eventType: string): string {
  return eventType.startsWith("Mesh") ? `Mesh.${eventType.slice(4)}` : `Mesh.${eventType}`;
}

export function toCanonicalEngineEventType(prefix: string, eventType: string): string {
  return eventType.startsWith(prefix) ? `${prefix}.${eventType.slice(prefix.length)}` : `${prefix}.${eventType}`;
}

export function domainFromEntityType(entityType: string, fallback?: string): string {
  return fallback ?? entityDomainMap[entityType] ?? "SYSTEM";
}

export function defaultMetadata(sourceSystem: CanonicalSourceSystem, domain: string, extraTags: string[] = []): CanonicalEvent["metadata"] {
  return {
    schemaVersion: 1,
    tags: [sourceSystem, domain, ...extraTags].filter(Boolean),
    flags: {
      isReplay: false,
      isSynthetic: false
    }
  };
}

export function resourceParts(resource?: string): { aggregateType: string; aggregateId: string } {
  if (!resource) {
    return { aggregateType: "mesh-event", aggregateId: "unknown" };
  }

  const [typePart, idPart] = resource.split("/");
  const singularType = typePart?.endsWith("s") ? typePart.slice(0, -1) : typePart;
  return {
    aggregateType: singularType || "mesh-event",
    aggregateId: idPart || resource
  };
}