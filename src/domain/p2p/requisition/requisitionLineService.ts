import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { calculateTax, determineTaxByCode } from "../../tax/taxService";

type RequisitionState = "Draft" | "Submitted" | "Approved" | "ConvertedToPO" | "Rejected" | "Cancelled";

interface RequisitionRow {
  requisition_id: string;
  state: RequisitionState;
  total_amount: number;
  legal_entity_id: string | null;
  version: number;
}

interface RequisitionLineRow {
  requisition_line_id: string;
  requisition_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_code_id: string | null;
  tax_applicability: string | null;
  tax_rate_percent: number | null;
  tax_amount: number;
  created_at: string;
}

interface RequisitionTaxOptionRow {
  tax_code_id: string;
  code: string;
  tax_applicability: string;
  rate_percent: number;
}

function now(): string {
  return new Date().toISOString();
}

function buildTaxOptionLabel(input: { taxApplicability: string; ratePercent: number }): string {
  if (input.taxApplicability === "exempt") {
    return "Exempt Supplies";
  }

  if (input.taxApplicability === "zero-rated" || input.ratePercent === 0) {
    return "Zero-Rated Supplies (0%)";
  }

  return `Standard Rate (${input.ratePercent}%)`;
}

function inferCountryCodeFromLegalEntity(legalEntityId: string | null | undefined): string {
  if (!legalEntityId) {
    return "AE";
  }

  const row = db
    .prepare("SELECT locale, currency_code FROM r2r_legal_entity WHERE legal_entity_id = ?")
    .get(legalEntityId) as
    | {
        locale: string | null;
        currency_code: string | null;
      }
    | undefined;

  if (!row) {
    return "AE";
  }

  const localeCountry = row.locale?.split("-")[1]?.toUpperCase();
  if (localeCountry && localeCountry.length === 2) {
    return localeCountry;
  }

  const currency = row.currency_code?.toUpperCase();
  if (currency === "AED") {
    return "AE";
  }
  if (currency === "USD") {
    return "US";
  }
  if (currency === "AUD") {
    return "AU";
  }

  return "AE";
}

function getRequisitionForLines(requisitionId: string): RequisitionRow {
  const row = db.prepare("SELECT requisition_id, state, total_amount, legal_entity_id, version FROM p2p_requisition WHERE requisition_id = ?").get(requisitionId) as
    | RequisitionRow
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Requisition not found");
  }

  return row;
}

function assertDraftState(state: RequisitionState) {
  if (state !== "Draft") {
    throw new HttpError(409, "invalid_transition", "Requisition lines can only be changed in Draft state");
  }
}

function getLineOrThrow(requisitionId: string, requisitionLineId: string): RequisitionLineRow {
  const row = db.prepare("SELECT * FROM p2p_requisition_line WHERE requisition_line_id = ? AND requisition_id = ?").get(requisitionLineId, requisitionId) as
    | RequisitionLineRow
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Requisition line not found");
  }

  return row;
}

function sumRequisitionLineTotals(requisitionId: string): number {
  const row = db.prepare("SELECT COALESCE(SUM(line_total), 0) AS total FROM p2p_requisition_line WHERE requisition_id = ?").get(requisitionId) as
    | { total: number }
    | undefined;

  return row?.total ?? 0;
}

function updateRequisitionTotals(requisitionId: string, nextVersion: number, timestamp: string) {
  const totalAmount = sumRequisitionLineTotals(requisitionId);
  db.prepare("UPDATE p2p_requisition SET total_amount = ?, version = ?, updated_at = ? WHERE requisition_id = ?")
    .run(totalAmount, nextVersion, timestamp, requisitionId);
  return totalAmount;
}

export function listRequisitionLines(requisitionId: string): RequisitionLineRow[] {
  getRequisitionForLines(requisitionId);
  return db
    .prepare("SELECT * FROM p2p_requisition_line WHERE requisition_id = ? ORDER BY created_at ASC")
    .all(requisitionId) as RequisitionLineRow[];
}

export function listRequisitionTaxOptions(requisitionId: string) {
  const requisition = getRequisitionForLines(requisitionId);
  if (!requisition.legal_entity_id) {
    return [];
  }

  const asOfDate = now();

  const mappingRows = db
    .prepare(
      `SELECT
         tc.tax_code_id,
         tc.code,
         tc.tax_applicability,
         COALESCE(MAX(tr.rate_percent), 0) AS rate_percent
       FROM tax_account_mapping tam
       JOIN tax_code tc ON tc.tax_code_id = tam.tax_code_id
       LEFT JOIN tax_rate tr
         ON tr.tax_code_id = tc.tax_code_id
        AND tr.effective_from <= ?
        AND (tr.effective_to IS NULL OR tr.effective_to > ?)
       WHERE (tam.legal_entity_id = ? OR tam.legal_entity_id IS NULL)
         AND tam.transaction_type = 'ap-invoice'
         AND tam.is_active = 1
         AND tc.is_active = 1
       GROUP BY tc.tax_code_id, tc.code, tc.tax_applicability
       ORDER BY tc.code ASC`
    )
    .all(asOfDate, asOfDate, requisition.legal_entity_id) as RequisitionTaxOptionRow[];

  if (mappingRows.length > 0) {
    return mappingRows.map((row) => ({
      taxCodeId: row.tax_code_id,
      code: row.code,
      taxApplicability: row.tax_applicability,
      ratePercent: row.rate_percent,
      label: buildTaxOptionLabel({ taxApplicability: row.tax_applicability, ratePercent: row.rate_percent })
    }));
  }

  const regimeRows = db
    .prepare(
      `SELECT
         tc.tax_code_id,
         tc.code,
         tc.tax_applicability,
         COALESCE(MAX(tr.rate_percent), 0) AS rate_percent
       FROM r2r_legal_entity le
       JOIN tax_jurisdiction tj
         ON (
               UPPER(SUBSTR(le.locale, INSTR(le.locale, '-') + 1)) = tj.country_code
            OR (le.currency_code = 'AED' AND tj.country_code = 'AE')
            OR (le.currency_code = 'USD' AND tj.country_code = 'US')
         )
         AND tj.is_active = 1
       JOIN tax_code tc
         ON tc.tax_regime_id = tj.tax_regime_id
        AND tc.is_active = 1
        AND tc.tax_applicability NOT IN ('withholding')
       LEFT JOIN tax_rate tr
         ON tr.tax_code_id = tc.tax_code_id
        AND tr.tax_jurisdiction_id = tj.tax_jurisdiction_id
        AND tr.effective_from <= ?
        AND (tr.effective_to IS NULL OR tr.effective_to > ?)
       WHERE le.legal_entity_id = ?
       GROUP BY tc.tax_code_id, tc.code, tc.tax_applicability
       ORDER BY tc.code ASC`
    )
    .all(asOfDate, asOfDate, requisition.legal_entity_id) as RequisitionTaxOptionRow[];

  return regimeRows.map((row) => ({
    taxCodeId: row.tax_code_id,
    code: row.code,
    taxApplicability: row.tax_applicability,
    ratePercent: row.rate_percent,
    label: buildTaxOptionLabel({ taxApplicability: row.tax_applicability, ratePercent: row.rate_percent })
  }));
}

export function addRequisitionLine(
  input: { requisitionId: string; description: string; quantity: number; unitPrice: number; taxCodeId?: string; countryCode?: string },
  actor?: EventActor
): { line: RequisitionLineRow; requisition: RequisitionRow } {
  const requisition = getRequisitionForLines(input.requisitionId);
  assertDraftState(requisition.state);

  const requisitionLineId = newId("REQ-L-");
  const timestamp = now();
  const lineTotal = input.quantity * input.unitPrice;
  const invoiceDate = new Date().toISOString().slice(0, 10);
  const taxDetermination = input.taxCodeId
    ? determineTaxByCode({
        taxCodeId: input.taxCodeId,
        countryCode: input.countryCode ?? inferCountryCodeFromLegalEntity(requisition.legal_entity_id),
        invoiceDate
      })
    : null;
  if (input.taxCodeId && !taxDetermination) {
    throw new HttpError(409, "invalid_tax_code", `Tax code '${input.taxCodeId}' is invalid or inactive`);
  }
  const taxCalc = taxDetermination
    ? calculateTax(lineTotal, taxDetermination.ratePercent, taxDetermination.inclusiveFlag)
    : null;
  const taxAmount = taxCalc?.taxAmount ?? 0;
  const nextVersion = requisition.version + 1;

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_requisition_line(
         requisition_line_id,
         requisition_id,
         description,
         quantity,
         unit_price,
         line_total,
         tax_code_id,
         tax_applicability,
         tax_rate_percent,
         tax_amount,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      requisitionLineId,
      input.requisitionId,
      input.description,
      input.quantity,
      input.unitPrice,
      lineTotal,
      taxDetermination?.taxCodeId ?? null,
      taxDetermination?.taxApplicability ?? null,
      taxDetermination?.ratePercent ?? null,
      taxAmount,
      timestamp
    );

    const totalAmount = updateRequisitionTotals(input.requisitionId, nextVersion, timestamp);

    appendEvent({
      entityId: input.requisitionId,
      entityType: "Requisition",
      eventType: "requisition.line_added",
      version: nextVersion,
      payload: {
        requisitionLineId,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        lineTotal,
        taxCodeId: taxDetermination?.taxCodeId ?? null,
        taxAmount,
        totalAmount
      },
      actor
    });
  });

  const line = getLineOrThrow(input.requisitionId, requisitionLineId);
  const updatedRequisition = getRequisitionForLines(input.requisitionId);
  return { line, requisition: updatedRequisition };
}

export function updateRequisitionLine(
  input: { requisitionId: string; requisitionLineId: string; description: string; quantity: number; unitPrice: number; taxCodeId?: string; countryCode?: string },
  actor?: EventActor
): { line: RequisitionLineRow; requisition: RequisitionRow } {
  const requisition = getRequisitionForLines(input.requisitionId);
  assertDraftState(requisition.state);
  const existingLine = getLineOrThrow(input.requisitionId, input.requisitionLineId);

  const timestamp = now();
  const lineTotal = input.quantity * input.unitPrice;
  const effectiveTaxCodeId = input.taxCodeId ?? existingLine.tax_code_id ?? undefined;
  const invoiceDate = new Date().toISOString().slice(0, 10);
  const taxDetermination = effectiveTaxCodeId
    ? determineTaxByCode({
        taxCodeId: effectiveTaxCodeId,
        countryCode: input.countryCode ?? inferCountryCodeFromLegalEntity(requisition.legal_entity_id),
        invoiceDate
      })
    : null;
  if (effectiveTaxCodeId && !taxDetermination) {
    throw new HttpError(409, "invalid_tax_code", `Tax code '${effectiveTaxCodeId}' is invalid or inactive`);
  }
  const taxCalc = taxDetermination
    ? calculateTax(lineTotal, taxDetermination.ratePercent, taxDetermination.inclusiveFlag)
    : null;
  const taxAmount = taxCalc?.taxAmount ?? 0;
  const nextVersion = requisition.version + 1;

  transaction(() => {
    db.prepare(
      `UPDATE p2p_requisition_line
       SET description = ?,
           quantity = ?,
           unit_price = ?,
           line_total = ?,
           tax_code_id = ?,
           tax_applicability = ?,
           tax_rate_percent = ?,
           tax_amount = ?
       WHERE requisition_line_id = ? AND requisition_id = ?`
    ).run(
      input.description,
      input.quantity,
      input.unitPrice,
      lineTotal,
      taxDetermination?.taxCodeId ?? null,
      taxDetermination?.taxApplicability ?? null,
      taxDetermination?.ratePercent ?? null,
      taxAmount,
      input.requisitionLineId,
      input.requisitionId
    );

    const totalAmount = updateRequisitionTotals(input.requisitionId, nextVersion, timestamp);

    appendEvent({
      entityId: input.requisitionId,
      entityType: "Requisition",
      eventType: "requisition.line_updated",
      version: nextVersion,
      payload: {
        requisitionLineId: input.requisitionLineId,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        lineTotal,
        taxCodeId: taxDetermination?.taxCodeId ?? null,
        taxAmount,
        totalAmount
      },
      actor
    });
  });

  const line = getLineOrThrow(input.requisitionId, input.requisitionLineId);
  const updatedRequisition = getRequisitionForLines(input.requisitionId);
  return { line, requisition: updatedRequisition };
}

export function removeRequisitionLine(
  input: { requisitionId: string; requisitionLineId: string },
  actor?: EventActor
): RequisitionRow {
  const requisition = getRequisitionForLines(input.requisitionId);
  assertDraftState(requisition.state);
  const existingLine = getLineOrThrow(input.requisitionId, input.requisitionLineId);

  const timestamp = now();
  const nextVersion = requisition.version + 1;

  transaction(() => {
    db.prepare("DELETE FROM p2p_requisition_line WHERE requisition_line_id = ? AND requisition_id = ?")
      .run(input.requisitionLineId, input.requisitionId);

    const totalAmount = updateRequisitionTotals(input.requisitionId, nextVersion, timestamp);

    appendEvent({
      entityId: input.requisitionId,
      entityType: "Requisition",
      eventType: "requisition.line_removed",
      version: nextVersion,
      payload: {
        requisitionLineId: existingLine.requisition_line_id,
        removedLineTotal: existingLine.line_total,
        totalAmount
      },
      actor
    });
  });

  return getRequisitionForLines(input.requisitionId);
}
