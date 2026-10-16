import type { ActorContext } from '$lib/stores/actorStore';

export interface ApprovalTaskSummary {
	task_id: string;
	status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
	requested_by: string;
	adapter_id: string | null;
	resource_type: string | null;
	domain: string;
	resource_id: string;
	action: string;
	required_tier: number | null;
	escalated_to_tier: number | null;
	created_at: string;
}

// Thrown when the Mesh Gateway accepted the request but governance requires an approver to act first (HTTP 202).
export class ApprovalPendingError extends Error {
	readonly taskId: string;
	readonly requiredTier: number;
	readonly approvers: string[];

	constructor(task: { taskId: string; requiredTier: number; approvers: string[] }) {
		super(
			`Approval required: task ${task.taskId} was sent to Tier ${task.requiredTier}+ approvers. The change will apply once it is approved.`
		);
		this.name = 'ApprovalPendingError';
		this.taskId = task.taskId;
		this.requiredTier = task.requiredTier;
		this.approvers = task.approvers;
	}
}

function problemMessage(problem: Record<string, unknown>, status: number): string {
	for (const key of ['detail', 'error', 'message', 'title']) {
		if (typeof problem[key] === 'string') {
			return problem[key] as string;
		}
	}
	return `Request failed (${status})`;
}

async function meshRequest<T>(path: string, actor: ActorContext, method: 'GET' | 'POST', body?: unknown): Promise<T> {
	const response = await fetch(`/api/mesh/${path}`, {
		method,
		headers: {
			'x-actor-id': actor.actorId,
			...(method === 'POST' ? { 'content-type': 'application/json' } : {})
		},
		body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined
	});

	if (response.status === 202) {
		throw new ApprovalPendingError(
			(await response.json()) as { taskId: string; requiredTier: number; approvers: string[] }
		);
	}

	if (!response.ok) {
		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			throw new Error(problemMessage((await response.json()) as Record<string, unknown>, response.status));
		}
		throw new Error((await response.text()) || `Request failed (${response.status})`);
	}

	return (await response.json()) as T;
}

export function meshPostJson<T>(path: string, actor: ActorContext, body?: unknown): Promise<T> {
	return meshRequest<T>(path, actor, 'POST', body);
}

export function meshGetJson<T>(path: string, actor: ActorContext): Promise<T> {
	return meshRequest<T>(path, actor, 'GET');
}

export async function listMyApprovalTasks(actor: ActorContext): Promise<ApprovalTaskSummary[]> {
	const response = await meshGetJson<{ data: ApprovalTaskSummary[] }>(
		`approvals?actorId=${encodeURIComponent(actor.actorId)}`,
		actor
	);
	return response.data;
}

export function approveApprovalTask(actor: ActorContext, taskId: string): Promise<unknown> {
	return meshPostJson(`approvals/${encodeURIComponent(taskId)}/approve`, actor, {});
}

export function rejectApprovalTask(actor: ActorContext, taskId: string): Promise<unknown> {
	return meshPostJson(`approvals/${encodeURIComponent(taskId)}/reject`, actor, {});
}
