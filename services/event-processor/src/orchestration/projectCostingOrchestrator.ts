import { CanonicalEvent } from "../contracts/canonicalEvents";

type SupportedProjectEventType =
  | "proj.wip_material_posted"
  | "proj.wip_labor_posted"
  | "proj.wip_closed";

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isSupportedProjectEventType(eventType: string): eventType is SupportedProjectEventType {
  return (
    eventType === "proj.wip_material_posted" ||
    eventType === "proj.wip_labor_posted" ||
    eventType === "proj.wip_closed"
  );
}

function buildSyntheticEvent(
  sourceEvent: CanonicalEvent,
  syntheticEventType: string,
  syntheticSuffix: string,
  aggregateId: string,
  payload: Record<string, unknown>
): CanonicalEvent {
  return {
    eventId: `${sourceEvent.eventId}:${syntheticSuffix}`,
    eventType: syntheticEventType,
    eventVersion: 1,
    occurredAt: sourceEvent.occurredAt,
    source: {
      system: "event-processor",
      streamId: `${sourceEvent.eventId}:${syntheticSuffix}`,
      sequence: 0
    },
    correlation: {
      correlationId: sourceEvent.correlation.correlationId,
      causationId: sourceEvent.eventId
    },
    actor: {
      actorId: sourceEvent.actor.actorId,
      ingressId: "event-processor",
      impersonated: sourceEvent.actor.impersonated
    },
    domain: {
      domain: "R2R",
      aggregateType: "sla-posting",
      aggregateId,
      tenantId: sourceEvent.domain.tenantId
    },
    payload,
    metadata: {
      schemaVersion: 1,
      tags: ["event-processor", "R2R", "sla", sourceEvent.eventType],
      flags: {
        isReplay: false,
        isSynthetic: true
      }
    }
  };
}

function createMaterialPostingEvent(sourceEvent: CanonicalEvent): CanonicalEvent | null {
  const payload = sourceEvent.payload;
  const wipId = asString(payload.wipId);
  const projectId = asString(payload.projectId);
  const amount = asNumber(payload.totalCost);
  const sourceEventId = asString(payload.inventoryIssueEventId);

  if (!wipId || !projectId || amount === undefined) {
    return null;
  }

  return buildSyntheticEvent(
    sourceEvent,
    "R2R.sla_posting_requested",
    "sla-material",
    wipId,
    {
      postingReason: "ProjectMaterialToWIP",
      projectId,
      wipId,
      amount,
      currency: asString(payload.currency) ?? "BASE",
      sourceEventType: sourceEvent.eventType,
      sourceEventId,
      debitAccountHint: "ProjectWIP.Material",
      creditAccountHint: "Inventory"
    }
  );
}

function createLaborPostingEvent(sourceEvent: CanonicalEvent): CanonicalEvent | null {
  const payload = sourceEvent.payload;
  const wipId = asString(payload.wipId);
  const projectId = asString(payload.projectId);
  const amount = asNumber(payload.totalCost);
  const sourceEventId = asString(payload.timesheetId) ?? asString(payload.timesheetLineId);

  if (!wipId || !projectId || amount === undefined) {
    return null;
  }

  return buildSyntheticEvent(
    sourceEvent,
    "R2R.sla_posting_requested",
    "sla-labor",
    wipId,
    {
      postingReason: "ProjectLaborToWIP",
      projectId,
      wipId,
      amount,
      currency: asString(payload.currency) ?? "BASE",
      sourceEventType: sourceEvent.eventType,
      sourceEventId,
      debitAccountHint: "ProjectWIP.Labor",
      creditAccountHint: "LaborAbsorption"
    }
  );
}

function createWipCloseEvent(sourceEvent: CanonicalEvent): CanonicalEvent | null {
  const payload = sourceEvent.payload;
  const wipId = asString(payload.wipId);
  const projectId = asString(payload.projectId);
  const amount = asNumber(payload.finalTotalBalance);
  const closureType = asString(payload.closureType) ?? asString(payload.completionType);

  if (!wipId || !projectId || amount === undefined || !closureType) {
    return null;
  }

  const debitAccountHint = closureType === "FG_Conversion" ? "Inventory.FinishedGoods" : "ProjectClose.Expense";

  return buildSyntheticEvent(
    sourceEvent,
    "R2R.sla_posting_requested",
    "sla-close",
    wipId,
    {
      postingReason: "ProjectWIPClose",
      closureType,
      projectId,
      wipId,
      amount,
      currency: asString(payload.currency) ?? "BASE",
      sourceEventType: sourceEvent.eventType,
      sourceEventId: sourceEvent.eventId,
      debitAccountHint,
      creditAccountHint: "ProjectWIP.Total"
    }
  );
}

export function deriveProjectCostingEvents(sourceEvent: CanonicalEvent): CanonicalEvent[] {
  if (!isSupportedProjectEventType(sourceEvent.eventType)) {
    return [];
  }

  const derived =
    sourceEvent.eventType === "proj.wip_material_posted"
      ? createMaterialPostingEvent(sourceEvent)
      : sourceEvent.eventType === "proj.wip_labor_posted"
        ? createLaborPostingEvent(sourceEvent)
        : createWipCloseEvent(sourceEvent);

  return derived ? [derived] : [];
}
