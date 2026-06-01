import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export type MappingStatus = 'MAPPED' | 'PARTIAL' | 'NOT_APPLICABLE' | 'GAP';

export interface UpsertFieldMappingPayload {
	fieldId: string;
	systemId: string;
	erpModule?: string | null;
	erpTable?: string | null;
	erpField?: string | null;
	erpFullReference?: string | null;
	mappingStatus: MappingStatus;
	transformationNotes?: string | null;
	isBidirectional?: boolean;
}

export interface FieldMappingRow {
	id: string;
	field_id: string;
	system_id: string;
	erp_module: string | null;
	erp_table: string | null;
	erp_field: string | null;
	erp_full_reference: string | null;
	mapping_status: MappingStatus;
	transformation_notes: string | null;
	is_bidirectional: number;
	created_at: string;
	updated_at: string;
}

interface MappingResponse {
	data: FieldMappingRow;
}

export function createFieldMapping(payload: UpsertFieldMappingPayload, actor: ActorContext): Promise<MappingResponse> {
	return fetchHubJson<MappingResponse>('/api/v1/mappings', actor, {
		method: 'POST',
		body: JSON.stringify(payload)
	});
}

export function updateFieldMapping(
	id: string,
	payload: Partial<UpsertFieldMappingPayload>,
	actor: ActorContext
): Promise<MappingResponse> {
	return fetchHubJson<MappingResponse>(`/api/v1/mappings/${encodeURIComponent(id)}`, actor, {
		method: 'PUT',
		body: JSON.stringify(payload)
	});
}
