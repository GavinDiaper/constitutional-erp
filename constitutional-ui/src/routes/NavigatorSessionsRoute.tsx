import { useState } from "react";
import {
  createSession,
  getSession,
  getSessionNavlog,
  getSessionTranscript,
  type NavSession,
} from "../api/navlogApi";
import { useActor } from "../context/ActorContext";

export default function NavigatorSessionsRoute() {
  const { actorId } = useActor();
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<NavSession | null>(null);
  const [navlogCount, setNavlogCount] = useState(0);
  const [transcriptCount, setTranscriptCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    try {
      const created = await createSession(actorId ?? "principal.system", "online");
      setSessionId(created.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    }
  }

  async function handleLookup() {
    if (!sessionId.trim()) return;
    setError(null);
    try {
      const [s, n, t] = await Promise.all([
        getSession(sessionId.trim()),
        getSessionNavlog(sessionId.trim()),
        getSessionTranscript(sessionId.trim()),
      ]);
      setSession(s);
      setNavlogCount(n.data.length);
      setTranscriptCount(t.data.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch session");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Navigator Sessions</h1>
        <p className="text-sm text-slate-600">Create and inspect Hub sessions, navlog, and transcript.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={handleCreate} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
          Start Session
        </button>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="session id"
          className="min-w-[320px] rounded-lg border border-slate-300 p-2 text-sm font-mono"
        />
        <button type="button" onClick={handleLookup} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Load
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {session && (
        <div className="rounded-xl border border-slate-200 p-4 text-sm space-y-1">
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
