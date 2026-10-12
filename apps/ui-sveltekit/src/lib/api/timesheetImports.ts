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

export interface TimesheetSummary {
	timesheetId: string;
	organizationId: string;
	employeeId?: string;
	resourceType: 'employee' | 'contractor';
	resourceId: string;
	periodStart: string;
	periodEnd: string;
	totalHours: number;
	totalCost: number;
	status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Posted';
	approvalStatus: 'Pending' | 'Approved' | 'Rejected';
	lineCount: number;
	rejectionReason?: string;
}

export interface TimesheetDetailLine {
	timesheetLineId: string;
	projectId?: string;
	taskId?: string;
	resourceId?: string;
	resourceType?: 'employee' | 'contractor';
	workDate: string;
	hours: number;
	hourlyRate: number;
	lineCost: number;
	description?: string;
}

export function listTimesheetsForOrganization(actor: ActorContext, organizationId: string): Promise<{ data: TimesheetSummary[] }> {
	const query = new URLSearchParams({ organizationId, limit: '500', offset: '0' });
	return fetchHubJson(`/api/hub/timesheets?${query.toString()}`, actor);
}

export function getTimesheetLines(actor: ActorContext, timesheetId: string): Promise<{ data: TimesheetDetailLine[] }> {
	return fetchHubJson(`/api/hub/timesheets/${encodeURIComponent(timesheetId)}/lines`, actor);
}

export function submitTimesheetForApproval(actor: ActorContext, timesheetId: string): Promise<{ data: TimesheetSummary }> {
	return postHubJson(`/api/hub/timesheets/${encodeURIComponent(timesheetId)}/submit`, actor, {});
}

export function approveTimesheet(actor: ActorContext, timesheetId: string): Promise<{ data: TimesheetSummary }> {
	return postHubJson(`/api/hub/timesheets/${encodeURIComponent(timesheetId)}/approve`, actor, {});
}

export function rejectTimesheet(actor: ActorContext, timesheetId: string, reason: string): Promise<{ data: TimesheetSummary }> {
	return postHubJson(`/api/hub/timesheets/${encodeURIComponent(timesheetId)}/reject`, actor, { reason });
}

export function reopenTimesheet(actor: ActorContext, timesheetId: string): Promise<{ data: TimesheetSummary }> {
	return postHubJson(`/api/hub/timesheets/${encodeURIComponent(timesheetId)}/reopen`, actor, {});
}