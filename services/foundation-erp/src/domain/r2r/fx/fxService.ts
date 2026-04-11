import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { HttpError } from "../../../utils/errors";
import { newId } from "../../../utils/id";

function now(): string {
  return new Date().toISOString();
}

export function createFxRateType(input: { code: string; name: string; description?: string }) {
  const rateTypeId = newId("FXT-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_fx_rate_type(rate_type_id, code, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(rateTypeId, input.code, input.name, input.description ?? null, timestamp, timestamp);

    appendEvent({
      entityId: rateTypeId,
      entityType: "FXRateType",
      eventType: "fx-rate-type.created",
      version: 1,
      payload: {
        code: input.code,
        name: input.name
      }
    });
  });

  return getFxRateTypeById(rateTypeId);
}

export function getFxRateTypeById(rateTypeId: string) {
  const row = db.prepare("SELECT * FROM r2r_fx_rate_type WHERE rate_type_id = ?").get(rateTypeId);
  if (!row) {
    throw new HttpError(404, "not_found", "FX rate type not found");
  }

  return row;
}

export function listFxRateTypes() {
  return db.prepare("SELECT * FROM r2r_fx_rate_type ORDER BY code ASC LIMIT 200").all();
}

function ensureRateTypeExists(rateTypeId: string) {
  const row = db.prepare("SELECT rate_type_id FROM r2r_fx_rate_type WHERE rate_type_id = ?").get(rateTypeId);
  if (!row) {
    throw new HttpError(404, "not_found", "FX rate type not found");
  }
}

export function createFxRate(input: {
  rateTypeId: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  validFrom: string;
  validTo?: string;
}) {
  ensureRateTypeExists(input.rateTypeId);

  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    throw new HttpError(400, "invalid_request", "FX rate must be a positive number");
  }

  const rateId = newId("FXR-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_fx_rate(rate_id, rate_type_id, from_currency, to_currency, rate, valid_from, valid_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      rateId,
      input.rateTypeId,
      input.fromCurrency,
      input.toCurrency,
      input.rate,
      input.validFrom,
      input.validTo ?? null,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: rateId,
      entityType: "FXRate",
      eventType: "fx-rate.created",
      version: 1,
      payload: {
        rateTypeId: input.rateTypeId,
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        rate: input.rate,
        validFrom: input.validFrom,
        validTo: input.validTo ?? null
      }
    });
  });

  return getFxRateById(rateId);
}

export function getFxRateById(rateId: string) {
  const row = db.prepare("SELECT * FROM r2r_fx_rate WHERE rate_id = ?").get(rateId);
  if (!row) {
    throw new HttpError(404, "not_found", "FX rate not found");
  }

  return row;
}

export function listFxRates(rateTypeId?: string) {
  if (rateTypeId) {
    ensureRateTypeExists(rateTypeId);
    return db
      .prepare("SELECT * FROM r2r_fx_rate WHERE rate_type_id = ? ORDER BY valid_from DESC LIMIT 500")
      .all(rateTypeId);
  }

  return db.prepare("SELECT * FROM r2r_fx_rate ORDER BY valid_from DESC LIMIT 500").all();
}

export function getLatestFxRate(input: {
  rateTypeId: string;
  fromCurrency: string;
  toCurrency: string;
  asOf?: string;
}) {
  ensureRateTypeExists(input.rateTypeId);

  const asOf = input.asOf ?? now();

  const row = db
    .prepare(
      `SELECT *
       FROM r2r_fx_rate
       WHERE rate_type_id = ?
         AND from_currency = ?
         AND to_currency = ?
         AND valid_from <= ?
         AND (valid_to IS NULL OR valid_to >= ?)
       ORDER BY valid_from DESC
       LIMIT 1`
    )
    .get(input.rateTypeId, input.fromCurrency, input.toCurrency, asOf, asOf);

  if (!row) {
    throw new HttpError(404, "not_found", "No FX rate found for requested criteria");
  }

  return row;
}
