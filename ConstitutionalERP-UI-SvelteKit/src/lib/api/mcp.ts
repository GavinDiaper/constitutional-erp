import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';
import type { McpFunctionSummary } from '$lib/types/hub';

interface McpFunctionsPayload {
	data?: unknown[];
	functions?: unknown[];
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((entry) => asString(entry))
		.filter((entry): entry is string => entry !== undefined);
}

function toKebabCase(value: string): string {
	return value
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/[\s_]+/g, '-')
		.replace(/[^a-zA-Z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function deriveAggregateType(record: Record<string, unknown>): string | undefined {
	const explicit = asString(record.aggregateType);
	if (explicit) {
		return explicit;
	}

	const governanceTag = asString(record.governanceTag);
	if (governanceTag) {
		const parts = governanceTag.split('.');
		if (parts.length >= 2 && parts[1]) {
			return toKebabCase(parts[1]);
		}
	}

	const entity = asString(record.entity) ?? asString(record.entityType);
	if (entity) {
		return toKebabCase(entity);
	}

	return undefined;
}

function deriveAction(record: Record<string, unknown>): string | undefined {
	const explicit = asString(record.action);
	if (explicit) {
		return explicit;
	}

	const name = asString(record.name) ?? asString(record.id);
	if (!name) {
		return undefined;
	}

	const domain = asString(record.domain);
	const normalized = domain ? `${domain.toLowerCase()}_` : '';
	if (normalized && name.toLowerCase().startsWith(normalized)) {
		const suffix = name.slice(normalized.length);
		const segments = suffix.split('_');
		if (segments.length > 1) {
			return segments.slice(1).join('_');
		}
		return suffix;
	}

	return name;
}

function normalizeMcpFunction(value: unknown): McpFunctionSummary | null {
	const record = asRecord(value);
	const id = asString(record.id) ?? asString(record.name);
	const domain = asString(record.domain);
	const entity = asString(record.entity) ?? asString(record.entityType);
	const aggregateType = deriveAggregateType(record);
	const action = deriveAction(record);
	const inputSchema = asRecord(record.inputSchema);
	const requiredInputs = asStringArray(inputSchema.required);

	if (!id || !domain || !action) {
		return null;
	}

	return {
		id,
		entity,
		domain,
		aggregateType,
		action,
		operationType: asString(record.operationType),
		requiredInputs
	};
}

export async function getMcpFunctions(actor: ActorContext): Promise<{ data: McpFunctionSummary[] }> {
	const payload = await fetchHubJson<McpFunctionsPayload | unknown[]>('/api/hub/mcp/functions', actor);
	const raw = Array.isArray(payload)
		? payload
		: Array.isArray(payload.data)
			? payload.data
			: Array.isArray(payload.functions)
				? payload.functions
				: [];

	const data = raw
		.map((entry) => normalizeMcpFunction(entry))
		.filter((entry): entry is McpFunctionSummary => entry !== null);

	return { data };
}
