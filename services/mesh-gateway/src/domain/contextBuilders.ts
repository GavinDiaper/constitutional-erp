import { AuthorityDomain } from "./types";

export type DomainContextBuilder = (resource: Record<string, unknown>, actorId: string) => Record<string, unknown>;

function asNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const buildP2PContext: DomainContextBuilder = (resource, actorId) => ({
  requesterId: String(resource.requesterId ?? resource.requester ?? resource.requestedBy ?? actorId),
  amount: asNumber(resource.totalAmount ?? resource.total_amount ?? resource.amount ?? 0),
  supplierId: String(resource.supplierId ?? resource.supplier_id ?? "")
});

const buildR2RContext: DomainContextBuilder = (resource, actorId) => ({
  requesterId: String(resource.requesterId ?? resource.requester ?? actorId),
  journalType: String(resource.journalType ?? resource.journal_type ?? "GENERAL"),
  fiscalPeriodId: String(resource.fiscalPeriodId ?? resource.fiscal_period_id ?? ""),
  amount: asNumber(resource.totalDebit ?? resource.total_debit ?? resource.amount ?? 0)
});

const buildH2RContext: DomainContextBuilder = (resource, actorId) => {
  const employeeId = asOptionalString(resource.employeeId) ?? asOptionalString(resource.employee_id);
  const credentialType = asOptionalString(resource.credentialType) ?? asOptionalString(resource.type);

  return {
    requesterId: String(resource.requesterId ?? actorId),
    ...(employeeId ? { employeeId } : {}),
    ...(credentialType ? { credentialType } : {})
  };
};

const buildO2CContext: DomainContextBuilder = (resource, actorId) => ({
  requesterId: String(resource.requesterId ?? resource.requester ?? actorId),
  customerId: String(resource.customerId ?? resource.customer_id ?? ""),
  amount: asNumber(resource.totalAmount ?? resource.total_amount ?? resource.amount ?? 0)
});

const buildPROJContext: DomainContextBuilder = (resource, actorId) => ({
  requesterId: String(resource.createdBy ?? resource.created_by ?? resource.requesterId ?? actorId),
  amount: asNumber(resource.budgetAmount ?? resource.budget_amount ?? resource.amount ?? 0),
  customerId: String(resource.customerId ?? resource.customer_id ?? "")
});

const buildINVContext: DomainContextBuilder = (resource, actorId) => ({
  requesterId: String(resource.requesterId ?? resource.createdBy ?? resource.created_by ?? actorId),
  amount: asNumber(resource.totalValue ?? resource.total_value ?? resource.amount ?? 0)
});

const contextBuilders: Record<AuthorityDomain, DomainContextBuilder> = {
  PROJ: buildPROJContext,
  INV: buildINVContext,
  P2P: buildP2PContext,
  R2R: buildR2RContext,
  H2R: buildH2RContext,
  O2C: buildO2CContext
};

const RESOURCE_TYPE_ALIASES: Record<string, string> = {
  contracts: "contract",
  projects: "project"
};

export function canonicalResourceType(resource: string): string {
  const normalized = resource.toLowerCase();
  return RESOURCE_TYPE_ALIASES[normalized] ?? normalized;
}

export interface ContextMeta {
  resourceType: string;
  action?: string;
  body?: unknown;
}

// Contract approvals are judged on the Draft version awaiting approval, requested by whoever drafted it.
function overlayContractContext(context: Record<string, unknown>, resource: Record<string, unknown>, body: Record<string, unknown>) {
  const versions = Array.isArray(resource.versions) ? (resource.versions as Array<Record<string, unknown>>) : [];
  const wanted = typeof body.versionNumber === "number" ? body.versionNumber : undefined;
  const draft = versions.find((v) => (wanted ? v.version_number === wanted : v.status === "Draft"));
  if (draft) {
    context.amount = asNumber(draft.contract_value);
    context.requesterId = String(draft.created_by ?? context.requesterId);
    context.versionNumber = draft.version_number;
  } else {
    context.amount = asNumber((body.version as Record<string, unknown> | undefined)?.contractValue ?? context.amount);
  }
}

export function buildDomainContext(
  domain: AuthorityDomain,
  resource: Record<string, unknown>,
  actorId: string,
  meta?: ContextMeta
) {
  const context = contextBuilders[domain](resource, actorId);
  if (!meta) {
    return context;
  }

  const body = meta.body && typeof meta.body === "object" && !Array.isArray(meta.body) ? (meta.body as Record<string, unknown>) : {};
  context.resourceType = meta.resourceType;
  if (meta.resourceType === "contract") {
    overlayContractContext(context, resource, body);
  }
  if (meta.resourceType === "project" && meta.action === "cancel") {
    context.force = body.forceCancel === true;
  }

  return context;
}

export function parseDomainSegment(segment: string): AuthorityDomain {
  const normalized = segment.toUpperCase();
  if (["O2C", "P2P", "R2R", "H2R", "PROJ", "INV"].includes(normalized)) {
    return normalized as AuthorityDomain;
  }

  throw new Error(`Unsupported domain segment: ${segment}`);
}
