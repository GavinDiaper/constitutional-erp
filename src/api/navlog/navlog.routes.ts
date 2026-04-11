/**
 * Integration Hub: Navlog & Transcript Endpoints
 * 
 * Provides REST API for:
 * - Session management (start/end REPL sessions)
 * - Navlog queries (view proposal/simulation/decision/execution history)
 * - Transcript queries (view command history)
 * - Governance decision log
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../db/connection";
import { newId } from "../../utils/id";

export const navlogRouter = Router();

// ── Session Management ────────────────────────────────────────────────────────

interface NavlogSession {
  session_id: string;
  actor_id: string;
  started_at: string;
  ended_at?: string;
  context_json?: string;
}

interface NavlogEntry {
  navlog_id: string;
  session_id: string;
  timestamp: string;
  entry_type: "proposal" | "simulation" | "decision" | "execution";
  entity_type?: string;
  entity_id?: string;
  action?: string;
  actor_id?: string;
  proposal_json?: string;
  simulation_json?: string;
  simulation_outcome?: string;
  decision_json?: string;
  execution_json?: string;
  execution_result?: string;
  error_message?: string;
}

const startSessionSchema = z.object({
  actor_id: z.string(),
  context: z.record(z.any()).optional(),
});

navlogRouter.post("/sessions/start", (req: Request, res: Response) => {
  const { actor_id, context } = startSessionSchema.parse(req.body);
  
  const session_id = newId("SES-");
  const now = new Date().toISOString();
  
  try {
    db.prepare(`
      INSERT INTO repl_session (session_id, actor_id, started_at, context_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(session_id, actor_id, now, context ? JSON.stringify(context) : null, now);
    
    res.json({
      session_id,
      actor_id,
      started_at: now,
      message: "Session started; ready for commands"
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to start session", detail: String(err) });
  }
});

navlogRouter.post("/sessions/:sessionId/end", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const now = new Date().toISOString();
  
  try {
    const session = db.prepare("SELECT * FROM repl_session WHERE session_id = ?").get(sessionId) as NavlogSession | undefined;
    if (!session) return res.status(404).json({ error: "Session not found" });
    
    db.prepare("UPDATE repl_session SET ended_at = ? WHERE session_id = ?").run(now, sessionId);
    
    res.json({
      session_id: sessionId,
      ended_at: now,
      message: "Session ended"
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to end session", detail: String(err) });
  }
});

navlogRouter.get("/sessions/:sessionId", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  
  try {
    const session = db.prepare("SELECT * FROM repl_session WHERE session_id = ?").get(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch session", detail: String(err) });
  }
});

navlogRouter.get("/sessions", (req: Request, res: Response) => {
  const { actor_id, status, limit = "100" } = req.query;

  try {
    let query = "SELECT * FROM repl_session WHERE 1=1";
    const params: unknown[] = [];

    if (actor_id) {
      query += " AND actor_id = ?";
      params.push(actor_id);
    }

    if (status === "open") {
      query += " AND ended_at IS NULL";
    } else if (status === "closed") {
      query += " AND ended_at IS NOT NULL";
    }

    query += " ORDER BY started_at DESC LIMIT ?";
    params.push(parseInt(limit as string, 10));

    const sessions = db.prepare(query).all(...params);

    res.json({
      data: sessions,
      count: (sessions as unknown[]).length
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sessions", detail: String(err) });
  }
});

// ── Navlog Queries ───────────────────────────────────────────────────────────

const addNavlogEntrySchema = z.object({
  entry_type: z.enum(["proposal", "simulation", "decision", "execution"]),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  action: z.string().optional(),
  actor_id: z.string(),
  proposal_json: z.any().optional(),
  simulation_json: z.any().optional(),
  simulation_outcome: z.enum(["success", "failure", "blocked"]).optional(),
  decision_json: z.any().optional(),
  execution_json: z.any().optional(),
  execution_result: z.enum(["success", "failure", "error"]).optional(),
  error_message: z.string().optional(),
});

navlogRouter.post("/sessions/:sessionId/navlog", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const entry = addNavlogEntrySchema.parse(req.body);
  
  const navlog_id = newId("NAV-");
  const timestamp = new Date().toISOString();
  
  try {
    // Verify session exists
    const session = db.prepare("SELECT * FROM repl_session WHERE session_id = ?").get(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    
    db.prepare(`
      INSERT INTO navlog (
        navlog_id, session_id, timestamp, entry_type, entity_type, entity_id, action, actor_id,
        proposal_json, simulation_json, simulation_outcome, decision_json, execution_json, execution_result, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      navlog_id, sessionId, timestamp, entry.entry_type,
      entry.entity_type ?? null, entry.entity_id ?? null, entry.action ?? null, entry.actor_id,
      entry.proposal_json ? JSON.stringify(entry.proposal_json) : null,
      entry.simulation_json ? JSON.stringify(entry.simulation_json) : null,
      entry.simulation_outcome ?? null,
      entry.decision_json ? JSON.stringify(entry.decision_json) : null,
      entry.execution_json ? JSON.stringify(entry.execution_json) : null,
      entry.execution_result ?? null,
      entry.error_message ?? null,
      timestamp
    );
    
    res.json({
      navlog_id,
      session_id: sessionId,
      timestamp,
      entry_type: entry.entry_type,
      message: "Navlog entry recorded"
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to record navlog entry", detail: String(err) });
  }
});

navlogRouter.get("/sessions/:sessionId/navlog", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { entry_type, limit = "100" } = req.query;
  
  try {
    let query = "SELECT * FROM navlog WHERE session_id = ?";
    const params: any[] = [sessionId];
    
    if (entry_type) {
      query += " AND entry_type = ?";
      params.push(entry_type);
    }
    
    query += " ORDER BY timestamp DESC LIMIT ?";
    params.push(parseInt(limit as string));
    
    const entries = db.prepare(query).all(...params);
    
    res.json({
      session_id: sessionId,
      entries: entries,
      count: (entries as any[]).length
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch navlog", detail: String(err) });
  }
});

// ── Transcript Queries ───────────────────────────────────────────────────────

const addTranscriptSchema = z.object({
  command: z.string(),
  command_type: z.enum(["mcp_invoke", "query", "navigate", "meta"]),
  arguments_json: z.any().optional(),
  actor_id: z.string(),
  output_json: z.any().optional(),
  output_text: z.string().optional(),
  status: z.enum(["success", "error", "partial"]),
  error_message: z.string().optional(),
  context_json: z.any().optional(),
  execution_time_ms: z.number().optional(),
});

navlogRouter.post("/sessions/:sessionId/transcript", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const entry = addTranscriptSchema.parse(req.body);
  
  const transcript_id = newId("TRS-");
  const timestamp = new Date().toISOString();
  
  try {
    // Verify session exists
    const session = db.prepare("SELECT * FROM repl_session WHERE session_id = ?").get(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    
    db.prepare(`
      INSERT INTO transcript (
        transcript_id, session_id, timestamp, command, command_type, arguments_json, actor_id,
        output_json, output_text, status, error_message, context_json, execution_time_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transcript_id, sessionId, timestamp, entry.command, entry.command_type,
      entry.arguments_json ? JSON.stringify(entry.arguments_json) : null,
      entry.actor_id,
      entry.output_json ? JSON.stringify(entry.output_json) : null,
      entry.output_text ?? null,
      entry.status,
      entry.error_message ?? null,
      entry.context_json ? JSON.stringify(entry.context_json) : null,
      entry.execution_time_ms ?? null,
      timestamp
    );
    
    res.json({
      transcript_id,
      session_id: sessionId,
      timestamp,
      status: entry.status,
      message: "Transcript entry recorded"
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to record transcript", detail: String(err) });
  }
});

navlogRouter.get("/sessions/:sessionId/transcript", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { command_type, status, limit = "100" } = req.query;
  
  try {
    let query = "SELECT * FROM transcript WHERE session_id = ?";
    const params: any[] = [sessionId];
    
    if (command_type) {
      query += " AND command_type = ?";
      params.push(command_type);
    }
    
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    
    query += " ORDER BY timestamp DESC LIMIT ?";
    params.push(parseInt(limit as string));
    
    const entries = db.prepare(query).all(...params);
    
    res.json({
      session_id: sessionId,
      entries: entries,
      count: (entries as any[]).length
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transcript", detail: String(err) });
  }
});

// ── Governance Decision Log ──────────────────────────────────────────────────

navlogRouter.get("/governance-decisions", (req: Request, res: Response) => {
  const { actor_id, action, domain, limit = "100" } = req.query;
  
  try {
    let query = "SELECT * FROM governance_decision_log WHERE 1=1";
    const params: any[] = [];
    
    if (actor_id) {
      query += " AND actor_id = ?";
      params.push(actor_id);
    }
    
    if (action) {
      query += " AND action = ?";
      params.push(action);
    }
    
    if (domain) {
      query += " AND domain = ?";
      params.push(domain);
    }
    
    query += " ORDER BY timestamp DESC LIMIT ?";
    params.push(parseInt(limit as string));
    
    const decisions = db.prepare(query).all(...params);
    
    res.json({
      decisions: decisions,
      count: (decisions as any[]).length
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch governance decisions", detail: String(err) });
  }
});
