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

const contextBuilders: Record<AuthorityDomain, DomainContextBuilder> = {
  P2P: buildP2PContext,
  R2R: buildR2RContext,
  H2R: buildH2RContext,
  O2C: buildO2CContext
};

export function buildDomainContext(domain: AuthorityDomain, resource: Record<string, unknown>, actorId: string) {
  return contextBuilders[domain](resource, actorId);
}

export function parseDomainSegment(segment: string): AuthorityDomain {
  const normalized = segment.toUpperCase();
  if (normalized === "O2C" || normalized === "P2P" || normalized === "R2R" || normalized === "H2R") {
    return normalized;
  }

  throw new Error(`Unsupported domain segment: ${segment}`);
}
