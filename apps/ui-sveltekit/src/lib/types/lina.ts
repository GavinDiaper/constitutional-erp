export type LinaMode = 'create' | 'select' | 'investigate' | 'fix' | 'advance';

export interface LinaRoleOption {
	id: string;
	label: string;
	description: string;
}

export interface LinaModeOption {
	id: LinaMode;
	label: string;
	description: string;
}

export interface LinaActionOption {
	id: string;
	label: string;
	description: string;
}

export const LINA_ROLE_OPTIONS: LinaRoleOption[] = [
	{
		id: 'o2c_operator',
		label: 'O2C Operator',
		description: 'Handle customers, quotes, orders, invoices, and AR collections.'
	},
	{
		id: 'project_manager',
		label: 'Project Manager',
		description: 'Drive delivery, approvals, and milestone planning.'
	},
	{
		id: 'buyer',
		label: 'Buyer',
		description: 'Handle requisitions, supplier actions, and purchase orders.'
	},
	{
		id: 'accountant',
		label: 'Accountant',
		description: 'Control journal flow, close checks, and reconciliation.'
	},
	{
		id: 'warehouse',
		label: 'Warehouse',
		description: 'Manage stock moves, picks, and receiving exceptions.'
	},
	{
		id: 'hr',
		label: 'HR',
		description: 'Coordinate people operations and staffing workflows.'
	},
	{
		id: 'admin',
		label: 'Admin',
		description: 'Oversee policy, governance, and system operations.'
	}
];

export const LINA_MODE_OPTIONS: LinaModeOption[] = [
	{
		id: 'create',
		label: 'Create',
		description: 'Create a new transaction or entity.'
	},
	{
		id: 'select',
		label: 'Select',
		description: 'Find and focus an existing entity.'
	},
	{
		id: 'investigate',
		label: 'Investigate',
		description: 'Inspect graph state and identify root causes.'
	},
	{
		id: 'fix',
		label: 'Fix',
		description: 'Resolve blockers and exception queues.'
	},
	{
		id: 'advance',
		label: 'Advance',
		description: 'Push a workflow to the next safe transition.'
	}
];
