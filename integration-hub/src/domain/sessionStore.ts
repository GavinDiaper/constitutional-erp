import { randomUUID } from "node:crypto";
import { HttpError } from "../utils/errors";
import { HubNavlogEntry, HubSessionRecord, HubTranscriptEntry, SessionMode } from "./types";

export class SessionStore {
  private readonly sessions = new Map<string, HubSessionRecord>();
  private readonly navlog = new Map<string, HubNavlogEntry[]>();
  private readonly transcripts = new Map<string, HubTranscriptEntry[]>();

  createSession(input: {
    actorId: string;
    mode: SessionMode;
    context?: Record<string, unknown>;
  }): HubSessionRecord {
    const now = new Date().toISOString();
    const session: HubSessionRecord = {
      sessionId: randomUUID(),
      actorId: input.actorId,
      mode: input.mode,
      context: input.context,
      createdAt: now,
      status: "open"
    };

    this.sessions.set(session.sessionId, session);
    this.navlog.set(session.sessionId, []);
    this.transcripts.set(session.sessionId, []);
    return session;
  }

  endSession(sessionId: string): HubSessionRecord {
    const session = this.requireSession(sessionId);
    if (session.status === "closed") {
      return session;
    }

    const ended: HubSessionRecord = {
      ...session,
      status: "closed",
      endedAt: new Date().toISOString()
    };

    this.sessions.set(sessionId, ended);
    return ended;
  }

  getSession(sessionId: string): HubSessionRecord {
    return this.requireSession(sessionId);
  }

  appendNavlog(sessionId: string, entry: HubNavlogEntry): void {
    this.requireOpenSession(sessionId);
    const current = this.navlog.get(sessionId) ?? [];
    current.push(entry);
    this.navlog.set(sessionId, current);
  }

  appendTranscript(sessionId: string, entry: HubTranscriptEntry): void {
    this.requireOpenSession(sessionId);
    const current = this.transcripts.get(sessionId) ?? [];
    current.push(entry);
    this.transcripts.set(sessionId, current);
  }

  listNavlog(sessionId: string): HubNavlogEntry[] {
    this.requireSession(sessionId);
    return this.navlog.get(sessionId) ?? [];
  }

  listTranscript(sessionId: string): HubTranscriptEntry[] {
    this.requireSession(sessionId);
    return this.transcripts.get(sessionId) ?? [];
  }

  private requireSession(sessionId: string): HubSessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new HttpError(404, "session_not_found", `Unknown session: ${sessionId}`);
    }

    return session;
  }

  private requireOpenSession(sessionId: string): HubSessionRecord {
    const session = this.requireSession(sessionId);
    if (session.status !== "open") {
      throw new HttpError(409, "session_closed", `Session is already closed: ${sessionId}`);
    }

    return session;
  }
}
