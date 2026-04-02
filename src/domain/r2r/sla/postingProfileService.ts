import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { HttpError } from "../../../utils/errors";
import { newId } from "../../../utils/id";
import { ensureAccountExists } from "../account/accountService";

function now(): string {
  return new Date().toISOString();
}

type PostingProfileLineInput = {
  entrySide: "debit" | "credit";
  accountId: string;
  amountSource: string;
  memoTemplate?: string;
};

function getPostingProfileLines(postingProfileId: string) {
  return db
    .prepare(
      `SELECT *
       FROM r2r_sla_posting_profile_line
       WHERE posting_profile_id = ?
       ORDER BY created_at ASC`
    )
    .all(postingProfileId);
}

export function createPostingProfile(input: {
  name: string;
  eventType: string;
  description?: string;
  isActive?: boolean;
  lines: PostingProfileLineInput[];
}) {
  if (input.lines.length === 0) {
    throw new HttpError(400, "invalid_request", "Posting profile must include at least one line");
  }

  const postingProfileId = newId("PP-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_sla_posting_profile(posting_profile_id, name, event_type, description, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      postingProfileId,
      input.name,
      input.eventType,
      input.description ?? null,
      input.isActive === false ? 0 : 1,
      timestamp,
      timestamp
    );

    const insertLine = db.prepare(
      `INSERT INTO r2r_sla_posting_profile_line(
         posting_profile_line_id,
         posting_profile_id,
         entry_side,
         account_id,
         amount_source,
         memo_template,
         created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const line of input.lines) {
      ensureAccountExists(line.accountId);
      insertLine.run(
        newId("PPL-"),
        postingProfileId,
        line.entrySide,
        line.accountId,
        line.amountSource,
        line.memoTemplate ?? null,
        timestamp
      );
    }

    appendEvent({
      entityId: postingProfileId,
      entityType: "SLAPostingProfile",
      eventType: "sla-posting-profile.created",
      version: 1,
      payload: {
        name: input.name,
        eventType: input.eventType,
        isActive: input.isActive !== false,
        lineCount: input.lines.length
      }
    });
  });

  return getPostingProfileById(postingProfileId);
}

export function listPostingProfiles() {
  const rows = db
    .prepare("SELECT * FROM r2r_sla_posting_profile ORDER BY created_at DESC LIMIT 200")
    .all() as Array<{ posting_profile_id: string }>;

  return rows.map((row) => ({
    ...row,
    lines: getPostingProfileLines(row.posting_profile_id)
  }));
}

export function getPostingProfileById(postingProfileId: string) {
  const row = db
    .prepare("SELECT * FROM r2r_sla_posting_profile WHERE posting_profile_id = ?")
    .get(postingProfileId) as { posting_profile_id: string } | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "SLA posting profile not found");
  }

  return {
    ...row,
    lines: getPostingProfileLines(postingProfileId)
  };
}

export function setPostingProfileActiveState(postingProfileId: string, isActive: boolean) {
  getPostingProfileById(postingProfileId);

  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE r2r_sla_posting_profile SET is_active = ?, updated_at = ? WHERE posting_profile_id = ?")
      .run(isActive ? 1 : 0, timestamp, postingProfileId);

    appendEvent({
      entityId: postingProfileId,
      entityType: "SLAPostingProfile",
      eventType: isActive ? "sla-posting-profile.activated" : "sla-posting-profile.deactivated",
      version: 1,
      payload: { isActive }
    });
  });

  return getPostingProfileById(postingProfileId);
}
