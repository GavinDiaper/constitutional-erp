import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type FiscalYearState = "Open" | "Closing" | "Closed";
type FiscalPeriodState = "Open" | "Closing" | "Closed" | "Locked";

const fiscalYearTransitions: Record<FiscalYearState, FiscalYearState[]> = {
  Open: ["Closing", "Closed"],
  Closing: ["Closed"],
  Closed: []
};

const fiscalPeriodTransitions: Record<FiscalPeriodState, FiscalPeriodState[]> = {
  Open: ["Closing", "Closed"],
  Closing: ["Closed"],
  Closed: ["Locked"],
  Locked: []
};

function now(): string {
  return new Date().toISOString();
}

// ── Fiscal Year ───────────────────────────────────────────────────────────────

export function getFiscalYearById(fiscalYearId: string) {
  const row = db.prepare("SELECT * FROM r2r_fiscal_year WHERE fiscal_year_id = ?").get(fiscalYearId) as
    | { fiscal_year_id: string; state: FiscalYearState; version?: number }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Fiscal year not found");
  }

  return row;
}

export function listFiscalYears() {
  return db.prepare("SELECT * FROM r2r_fiscal_year ORDER BY year_label DESC LIMIT 50").all();
}

export function createFiscalYear(input: { yearLabel: string; startDate: string; endDate: string }, actor?: EventActor) {
  const fiscalYearId = newId("FY-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_fiscal_year(fiscal_year_id, year_label, state, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, 'Open', ?, ?, ?, ?)`
    ).run(fiscalYearId, input.yearLabel, input.startDate, input.endDate, timestamp, timestamp);

    appendEvent({
      entityId: fiscalYearId,
      entityType: "FiscalYear",
      eventType: "fiscal-year.created",
      version: 1,
      actor,
      payload: input
    });
  });

  return getFiscalYearById(fiscalYearId);
}

export function updateFiscalYearState(fiscalYearId: string, toState: FiscalYearState, actor?: EventActor) {
  const fiscalYear = getFiscalYearById(fiscalYearId);
  if (!fiscalYearTransitions[fiscalYear.state].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition fiscal year from ${fiscalYear.state} to ${toState}`);
  }

  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE r2r_fiscal_year SET state = ?, updated_at = ? WHERE fiscal_year_id = ?")
      .run(toState, timestamp, fiscalYearId);

    appendEvent({
      entityId: fiscalYearId,
      entityType: "FiscalYear",
      eventType: `fiscal-year.${toState.toLowerCase()}`,
      version: 1,
      actor,
      payload: { from: fiscalYear.state, to: toState }
    });
  });

  return getFiscalYearById(fiscalYearId);
}

export function startYearClose(fiscalYearId: string, actor?: EventActor) {
  return updateFiscalYearState(fiscalYearId, "Closing", actor);
}

export function closeFiscalYear(fiscalYearId: string, actor?: EventActor) {
  return updateFiscalYearState(fiscalYearId, "Closed", actor);
}

// ── Fiscal Period ─────────────────────────────────────────────────────────────

export function getFiscalPeriodById(fiscalPeriodId: string) {
  const row = db.prepare("SELECT * FROM r2r_fiscal_period WHERE fiscal_period_id = ?").get(fiscalPeriodId) as
    | { fiscal_period_id: string; fiscal_year_id: string; state: FiscalPeriodState }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Fiscal period not found");
  }

  return row;
}

export function listFiscalPeriods(fiscalYearId?: string) {
  if (fiscalYearId) {
    return db
      .prepare("SELECT * FROM r2r_fiscal_period WHERE fiscal_year_id = ? ORDER BY period_number ASC")
      .all(fiscalYearId);
  }

  return db.prepare("SELECT * FROM r2r_fiscal_period ORDER BY start_date ASC LIMIT 200").all();
}

export function createFiscalPeriod(input: {
  fiscalYearId: string;
  periodNumber: number;
  startDate: string;
  endDate: string;
}, actor?: EventActor) {
  getFiscalYearById(input.fiscalYearId);

  const fiscalPeriodId = newId("FP-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_fiscal_period(fiscal_period_id, fiscal_year_id, period_number, state, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, 'Open', ?, ?, ?, ?)`
    ).run(
      fiscalPeriodId,
      input.fiscalYearId,
      input.periodNumber,
      input.startDate,
      input.endDate,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: fiscalPeriodId,
      entityType: "FiscalPeriod",
      eventType: "fiscal-period.created",
      version: 1,
      actor,
      payload: input
    });
  });

  return getFiscalPeriodById(fiscalPeriodId);
}

export function updateFiscalPeriodState(fiscalPeriodId: string, toState: FiscalPeriodState, actor?: EventActor) {
  const fiscalPeriod = getFiscalPeriodById(fiscalPeriodId);
  if (!fiscalPeriodTransitions[fiscalPeriod.state].includes(toState)) {
    throw new HttpError(
      409,
      "invalid_transition",
      `Cannot transition fiscal period from ${fiscalPeriod.state} to ${toState}`
    );
  }

  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE r2r_fiscal_period SET state = ?, updated_at = ? WHERE fiscal_period_id = ?")
      .run(toState, timestamp, fiscalPeriodId);

    appendEvent({
      entityId: fiscalPeriodId,
      entityType: "FiscalPeriod",
      eventType: `fiscal-period.${toState.toLowerCase()}`,
      version: 1,
      actor,
      payload: { from: fiscalPeriod.state, to: toState }
    });
  });

  return getFiscalPeriodById(fiscalPeriodId);
}

export function startPeriodClose(fiscalPeriodId: string, actor?: EventActor) {
  return updateFiscalPeriodState(fiscalPeriodId, "Closing", actor);
}

export function closePeriod(fiscalPeriodId: string, actor?: EventActor) {
  return updateFiscalPeriodState(fiscalPeriodId, "Closed", actor);
}

export function lockPeriod(fiscalPeriodId: string, actor?: EventActor) {
  return updateFiscalPeriodState(fiscalPeriodId, "Locked", actor);
}
