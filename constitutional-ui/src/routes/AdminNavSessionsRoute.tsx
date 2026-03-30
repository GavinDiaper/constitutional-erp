import { useState } from "react";
import {
  createSession,
  getSession,
  getSessionNavlog,
  getSessionTranscript,
  type NavSession,
} from "../api/navlogApi";

export default function AdminNavSessionsRoute() {
  const [actorId, setActorId] = useState("principal.system");
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<NavSession | null>(null);
  const [navlogCount, setNavlogCount] = useState<number>(0);
  const [transcriptCount, setTranscriptCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    try {
      const created = await createSession(actorId, "online");
      setSessionId(created.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    }
  }

  async function handleLookup() {
    if (!sessionId.trim()) return;
    setError(null);
    try {
      const [sessionData, navlog, transcript] = await Promise.all([
        getSession(sessionId.trim()),
        getSessionNavlog(sessionId.trim()),
        getSessionTranscript(sessionId.trim()),
      ]);
      setSession(sessionData);
      setNavlogCount(navlog.data.length);
      setTranscriptCount(transcript.data.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session details");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Navigator Sessions</h1>
        <p className="text-sm text-slate-600">Create sessions and inspect navlog/transcript depth.</p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Create session</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            className="min-w-[240px] rounded-lg border border-slate-300 p-2 text-sm"
            placeholder="actorId"
          />
          <button type="button" onClick={handleCreate} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
            Create
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Inspect session</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="min-w-[340px] rounded-lg border border-slate-300 p-2 text-sm font-mono"
            placeholder="sessionId (uuid)"
          />
          <button type="button" onClick={handleLookup} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
            Lookup
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {session && (
        <div className="rounded-xl border border-slate-200 p-4 text-sm space-y-2">
          <div>Session: <span className="font-mono text-xs">{session.sessionId}</span></div>
          <div>Actor: <span className="font-mono text-xs">{session.actorId}</span></div>
          <div>Status: {session.status}</div>
          <div>Mode: {session.mode}</div>
          <div>Navlog entries: {navlogCount}</div>
          <div>Transcript entries: {transcriptCount}</div>
        </div>
      )}
    </div>
  );
}
