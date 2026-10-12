import type { PageServerLoad } from './$types';

interface OrganizationRow {
	organization_id: string;
	organization_name?: string;
	name?: string;
}

interface EmployeeRow {
	employee_id: string;
	first_name?: string;
	last_name?: string;
	display_name?: string;
	full_name?: string;
}

interface ProjectTableRow {
	project_id: string;
	name: string;
	project_type?: string;
	status?: string;
	budget_amount?: number;
	actual_cost_amount?: number;
	default_wip_account_id?: string;
	default_close_account_id?: string;
	start_date?: string;
	end_date?: string;
	project_manager_id?: string;
	organization_id?: string;
	created_at?: string;
	created_by?: string;
	version?: number;
	last_event_at?: string;
	wip_material_balance?: number;
	wip_labor_balance?: number;
	wip_total_balance?: number;
}

interface QueryTableResponse<T> {
	data?: T[];
}

function mapProjectRow(row: ProjectTableRow) {
	return {
		projectId: row.project_id,
		name: row.name,
		description: undefined,
		customerId: undefined,
		contractId: undefined,
		wbsId: undefined,
		projectType: (row.project_type ?? 'Internal') as 'Internal' | 'Capital' | 'Billable' | 'Service',
		status: (row.status ?? 'Draft') as 'Draft' | 'Active' | 'OnHold' | 'Completed' | 'Cancelled',
		budgetAmount: row.budget_amount ?? 0,
		actualCostAmount: row.actual_cost_amount ?? 0,
		revenueAmount: undefined,
		defaultWIPAccountId: row.default_wip_account_id ?? 'ACCT-WIP-001',
		defaultCloseAccountId: row.default_close_account_id ?? 'ACCT-CLOSE-001',
		startDate: row.start_date ?? '',
		endDate: row.end_date,
		projectManagerId: row.project_manager_id ?? '',
		organizationId: row.organization_id ?? '',
		createdAt: row.created_at ?? new Date().toISOString(),
		createdBy: row.created_by ?? 'system',
		version: row.version ?? 1,
		lastEventAt: row.last_event_at ?? row.created_at ?? new Date().toISOString(),
		wipMaterialBalance: row.wip_material_balance ?? 0,
		wipLaborBalance: row.wip_labor_balance ?? 0,
		wipTotalBalance: row.wip_total_balance ?? 0,
		closedFGCost: undefined,
		closedExpenseCost: undefined
	};
}

async function loadTable<T>(fetchFn: typeof fetch, table: string): Promise<T[]> {
	const response = await fetchFn(`/api/hub/query/${table}?limit=500&offset=0`, {
		headers: {
			'x-actor-id': 'principal.system',
			'x-actor-tier': '5'
		}
	});

	if (!response.ok) {
		return [];
	}

	const payload = (await response.json()) as QueryTableResponse<T>;
	return payload.data ?? [];
}

export const load: PageServerLoad = async ({ fetch }) => {
	const [projectRows, organizationOptions, managerOptions] = await Promise.all([
		loadTable<ProjectTableRow>(fetch, 'proj_project'),
		loadTable<OrganizationRow>(fetch, 'inv_organization'),
		loadTable<EmployeeRow>(fetch, 'h2r_employee')
	]);

	return {
		initialProjects: projectRows.map(mapProjectRow),
		initialOrganizations: organizationOptions,
		initialManagers: managerOptions
	};
};