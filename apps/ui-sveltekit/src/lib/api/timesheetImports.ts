import { fetchHubJson, postHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export interface TimesheetImportRow {
	rowNumber: number;
	resourceType: 'employee' | 'contractor';
	resourceId: string;
	periodStart: string;
	periodEnd: string;
	projectId?: string;
	taskId?: string;
	workDate: string;
	hours: number;
	costElementId: string;
	role?: string;
	description?: string;
	hourlyRate: number;
	lineCost: number;
}

export interface TimesheetImportError {
	rowNumber: number;
	field?: string;
	message: string;
}

export interface TimesheetImportBatch {
	importBatchId: string;
	organizationId: string;
	sourceFilename: string;
	status: 'Validated' | 'Rejected' | 'Committed';
	rowCount: number;
	validRowCount: number;
	errorRowCount: number;
	rows: TimesheetImportRow[];
	errors: TimesheetImportError[];
	timesheetIds: string[];
	createdAt: string;
	committedAt?: string;
}

export interface TimesheetImportHistoryItem {
	importBatchId: string;
	organizationId: string;
	sourceFilename: string;
	status: TimesheetImportBatch['status'];
	rowCount: number;
	validRowCount: number;
	errorRowCount: number;
	timesheetIdsJson: string;
	importedBy: string;
	createdAt: string;
	committedAt?: string;
}

export async function downloadTimesheetImportTemplate(actor: ActorContext): Promise<Blob> {
	const response = await fetch('/api/hub/timesheets/import-template.csv', {
		headers: {
			'x-actor-id': actor.actorId,
			'x-actor-tier': String(actor.authorityTier)
		}
	});
	if (!response.ok) throw new Error(`Template download failed (${response.status})`);
	return response.blob();
}

export function previewTimesheetImport(
	actor: ActorContext,
	input: { organizationId: string; sourceFilename: string; csvText: string }
): Promise<{ data: TimesheetImportBatch }> {
	return postHubJson('/api/hub/timesheets/imports', actor, input);
}

export function commitTimesheetImport(actor: ActorContext, importBatchId: string): Promise<{ data: TimesheetImportBatch }> {
	return postHubJson(`/api/hub/timesheets/imports/${encodeURIComponent(importBatchId)}/commit`, actor, {});
}

export function listTimesheetImportHistory(
	actor: ActorContext,
	organizationId: string
): Promise<{ data: TimesheetImportHistoryItem[] }> {
	const query = new URLSearchParams({ organizationId });
	return fetchHubJson(`/api/hub/timesheets/imports?${query.toString()}`, actor);
}