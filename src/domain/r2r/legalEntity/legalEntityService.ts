import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { HttpError } from "../../../utils/errors";
import { newId } from "../../../utils/id";

function now(): string {
  return new Date().toISOString();
}

export type CreateLegalEntityInput = {
  name: string;
  currencyCode: string;
  locale?: string;
  parentLegalEntityId?: string;
};

export function getLegalEntityById(legalEntityId: string) {
  const row = db.prepare("SELECT * FROM r2r_legal_entity WHERE legal_entity_id = ?").get(legalEntityId);
  if (!row) {
    throw new HttpError(404, "not_found", "Legal entity not found");
  }

  return row;
}

export function listLegalEntities() {
  return db.prepare("SELECT * FROM r2r_legal_entity ORDER BY created_at DESC LIMIT 200").all();
}

export function ensureLegalEntityExists(legalEntityId: string) {
  const row = db.prepare("SELECT legal_entity_id FROM r2r_legal_entity WHERE legal_entity_id = ?").get(legalEntityId);
  if (!row) {
    throw new HttpError(404, "not_found", "Legal entity not found");
  }
}

export function createLegalEntity(input: CreateLegalEntityInput, actor?: EventActor) {
  if (input.parentLegalEntityId) {
    ensureLegalEntityExists(input.parentLegalEntityId);
  }

  const legalEntityId = newId("LE-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_legal_entity(legal_entity_id, name, currency_code, locale, parent_legal_entity_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      legalEntityId,
      input.name,
      input.currencyCode,
      input.locale ?? null,
      input.parentLegalEntityId ?? null,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: legalEntityId,
      entityType: "LegalEntity",
      eventType: "legal-entity.created",
      version: 1,
      actor,
      payload: {
        name: input.name,
        currencyCode: input.currencyCode,
        locale: input.locale ?? null,
        parentLegalEntityId: input.parentLegalEntityId ?? null
      }
    });
  });

  return getLegalEntityById(legalEntityId);
}