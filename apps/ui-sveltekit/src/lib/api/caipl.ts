import type { ActorContext } from '$lib/stores/actorStore';

export interface CaiplSession {
	id: string;
	userId: string;
	createdAt: string;
	updatedAt: string;
	currentGoal: string;
	currentStepId: string | null;
	status: 'active' | 'archived';
	version: number;
}

export interface CaiplPlanNode {
	id: string;
	type: 'process_step' | 'entity' | 'decision' | 'data_collection' | 'mcp_action';
	label: string;
	metadata: Record<string, unknown>;
	status: 'pending' | 'active' | 'completed' | 'blocked' | 'failed';
}

export interface CaiplPlanEdge {
	edgeId: string;
	from: string;
	to: string;
	type: 'depends_on' | 'leads_to' | 'requires';
}

export interface CaiplPlanGraph {
	nodes: CaiplPlanNode[];
	edges: CaiplPlanEdge[];
}

export interface CaiplInputSchemaField {
	id: string;
	label: string;
	type: 'string' | 'number' | 'date' | 'enum' | 'entityRef';
	required: boolean;
	options?: Array<string | number>;
}

export interface CaiplInputSchema {
	fields: CaiplInputSchemaField[];
}

export interface CaiplDecisionOption {
	id: string;
	label: string;
	description: string;
	actionPayload: Record<string, unknown>;
	inputSchema: CaiplInputSchema;
}

export interface CaiplDecisionPoint {
	id: string;
	sessionId: string;
	type: string;
	options: CaiplDecisionOption[];
	status: 'pending' | 'confirmed' | 'executing' | 'executed' | 'failed' | 'escalated' | 'resolved';
	resolvedBy: string | null;
	resolvedAt: string | null;
	version: number;
}

export interface CaiplArtefact {
	id: string;
	type: 'document' | 'note' | 'form' | 'table';
	content: Record<string, unknown> | string;
	linkedNodeId: string;
}

export interface CaiplInteractionTurn {
	id: string;
	sessionId: string;
	actor: 'user' | 'ai' | 'system';
	messageText: string;
	linkedNodes: string[];
	linkedArtefacts: string[];
	createdAt: string;
}

export interface CaiplGraphDelta {
	addedNodes: CaiplPlanNode[];
	updatedNodes: CaiplPlanNode[];
	removedNodes: string[];
	addedEdges: CaiplPlanEdge[];
	removedEdges: string[];
}

export interface CaiplNotebookDelta {
	added: CaiplArtefact[];
	updated: CaiplArtefact[];
	removed: string[];
}

export interface VersionMismatchError {
	error: 'VERSION_MISMATCH';
	message: string;
	scope: 'session' | 'decision';
	currentVersion: number;
	sessionId?: string;
	decisionId?: string;
}

export interface CreateSessionResponse {
	session: CaiplSession;
	initialTurns: CaiplInteractionTurn[];
	planGraph: CaiplPlanGraph;
	notebookSnapshot: CaiplArtefact[];
	decisions: CaiplDecisionPoint[];
}

export interface SessionSnapshotResponse {
	session: CaiplSession;
	turns: CaiplInteractionTurn[];
	decisions: CaiplDecisionPoint[];
	planGraph: CaiplPlanGraph;
	notebook: CaiplArtefact[];
}

export interface TurnResponse {
	newTurns: CaiplInteractionTurn[];
	decisionPoints: CaiplDecisionPoint[];
	graphDelta: CaiplGraphDelta;
	notebookDelta: CaiplNotebookDelta;
	session: CaiplSession;
}

export interface ResolveDecisionResponse {
	updatedDecision: CaiplDecisionPoint;
	graphDelta: CaiplGraphDelta;
	notebookDelta: CaiplNotebookDelta;
	newTurns: CaiplInteractionTurn[];
	session: CaiplSession;
}

export class CaiplVersionMismatch extends Error {
	readonly payload: VersionMismatchError;

	constructor(payload: VersionMismatchError) {
		super(payload.message);
		this.name = 'CaiplVersionMismatch';
		this.payload = payload;
	}
}

function actorHeaders(actor: ActorContext): HeadersInit {
	return {
		'content-type': 'application/json',
		'x-actor-id': actor.actorId,
		'x-actor-tier': String(actor.authorityTier)
	};
}

async function readResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
	const text = await response.text();

	if (!response.ok) {
		const parsed = tryParseJson(text);
		if (response.status === 409 && parsed && (parsed as Record<string, unknown>).error === 'VERSION_MISMATCH') {
			throw new CaiplVersionMismatch(parsed as VersionMismatchError);
		}

		if (parsed && typeof (parsed as Record<string, unknown>).detail === 'string') {
			throw new Error(String((parsed as Record<string, unknown>).detail));
		}

		throw new Error(text || fallbackMessage);
	}

	if (!text) {
		throw new Error(fallbackMessage);
	}

	const parsed = tryParseJson(text);
	if (!parsed) {
		throw new Error(fallbackMessage);
	}

	return parsed as T;
}

function tryParseJson(value: string): unknown | null {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

export async function createCaiplSession(
	actor: ActorContext,
	payload: { userId: string; currentGoal: string }
): Promise<CreateSessionResponse> {
	const response = await fetch('/api/caipl/session', {
		method: 'POST',
		headers: actorHeaders(actor),
		body: JSON.stringify(payload)
	});

	return readResponse<CreateSessionResponse>(response, 'Unable to create CAIPL session');
}

export async function getCaiplSession(
	actor: ActorContext,
	sessionId: string
): Promise<SessionSnapshotResponse> {
	const response = await fetch(`/api/caipl/session/${encodeURIComponent(sessionId)}`, {
		method: 'GET',
		headers: {
			'x-actor-id': actor.actorId,
			'x-actor-tier': String(actor.authorityTier)
		}
	});

	return readResponse<SessionSnapshotResponse>(response, 'Unable to load CAIPL session');
}

export async function sendCaiplTurn(
	actor: ActorContext,
	sessionId: string,
	payload: { actor: 'user' | 'ai' | 'system'; messageText: string; sessionVersion: number }
): Promise<TurnResponse> {
	const response = await fetch(`/api/caipl/session/${encodeURIComponent(sessionId)}/turn`, {
		method: 'POST',
		headers: actorHeaders(actor),
		body: JSON.stringify(payload)
	});

	return readResponse<TurnResponse>(response, 'Unable to submit CAIPL turn');
}

export async function resolveCaiplDecision(
	actor: ActorContext,
	decisionId: string,
	payload: {
		action: 'confirm' | 'reject' | 'amend' | 'retry' | 'escalate';
		actorId: string;
		sessionVersion: number;
		decisionVersion: number;
		note?: string;
		formInput?: Record<string, unknown>;
		optionId?: string;
	}
): Promise<ResolveDecisionResponse> {
	const response = await fetch(`/api/caipl/decision/${encodeURIComponent(decisionId)}/resolve`, {
		method: 'POST',
		headers: actorHeaders(actor),
		body: JSON.stringify(payload)
	});

	return readResponse<ResolveDecisionResponse>(response, 'Unable to resolve CAIPL decision');
}
