import { writable, derived, get } from 'svelte/store';
import type { ActorContext } from '$lib/stores/actorStore';
import { actorStore } from '$lib/stores/actorStore';
import type {
	Project,
	ProjectWIP,
	BomAssignment,
	LaborEntry,
	FinishedItem,
	ProjectRequisition,
	ProjectPurchaseOrder,
	ProjectSalesOrder,
	StatusBadgeStyle
} from '$lib/types/projects';
import {
	getProjectById,
	getProjectWIPSummary,
	listProjectBomAssignments,
	listLaborEntries,
	listProjectFinishedItems,
	listProjectRequisitions,
	listProjectPurchaseOrders,
	listProjectSalesOrders
} from '$lib/api/projects';

interface ProjectStoreState {
	currentProject: Project | null;
	wipSummary: ProjectWIP | null;
	bomAssignments: BomAssignment[];
	laborEntries: LaborEntry[];
	finishedItems: FinishedItem[];
	requisitions: ProjectRequisition[];
	purchaseOrders: ProjectPurchaseOrder[];
	salesOrders: ProjectSalesOrder[];
	loading: boolean;
	error: string | null;
}

const initialState: ProjectStoreState = {
	currentProject: null,
	wipSummary: null,
	bomAssignments: [],
	laborEntries: [],
	finishedItems: [],
	requisitions: [],
	purchaseOrders: [],
	salesOrders: [],
	loading: false,
	error: null
};

// Primary writable store
export const projectStore = writable<ProjectStoreState>(initialState);

// Derived store: project status badge mapping
export const projectStatusBadge = derived(
	projectStore,
	($store) => {
		const status = $store.currentProject?.status;
		const statusMap: Record<string, StatusBadgeStyle> = {
			Draft: { color: 'bg-gray-200 text-gray-800', label: 'Draft' },
			Active: { color: 'bg-green-200 text-green-800', label: 'Active' },
			OnHold: { color: 'bg-yellow-200 text-yellow-800', label: 'On Hold' },
			Completed: { color: 'bg-blue-200 text-blue-800', label: 'Completed' },
			Cancelled: { color: 'bg-red-200 text-red-800', label: 'Cancelled' }
		};
		return status ? statusMap[status] : { color: '', label: '' };
	}
);

/**
 * Load project and all related data in parallel
 * Sets loading=true, fetches data, catches errors to error store
 */
export async function loadProject(projectId: string): Promise<void> {
	projectStore.update((state) => ({ ...state, loading: true, error: null }));

	try {
		const actor = get(actorStore);

		// Fetch all data in parallel
		const [projectResponse, wipResponse, bomResponse, laborResponse, finishedResponse, requisitionsResponse, purchaseOrdersResponse, salesOrdersResponse] = await Promise.all([
			getProjectById(actor, projectId),
			getProjectWIPSummary(actor, projectId),
			listProjectBomAssignments(actor, projectId),
			listLaborEntries(actor, projectId),
			listProjectFinishedItems(actor, projectId),
			listProjectRequisitions(actor, projectId),
			listProjectPurchaseOrders(actor, projectId),
			listProjectSalesOrders(actor, projectId)
		]);

		projectStore.set({
			currentProject: projectResponse.data,
			wipSummary: wipResponse.data,
			bomAssignments: bomResponse.data,
			laborEntries: laborResponse.data,
			finishedItems: finishedResponse.data,
			requisitions: requisitionsResponse.data,
			purchaseOrders: purchaseOrdersResponse.data,
			salesOrders: salesOrdersResponse.data,
			loading: false,
			error: null
		});
	} catch (err: unknown) {
		const errorMessage = err instanceof Error ? err.message : 'Failed to load project';
		projectStore.update((state) => ({
			...state,
			loading: false,
			error: errorMessage
		}));
	}
}

/**
 * Reload the currently loaded project using its projectId
 */
export async function reloadCurrentProject(): Promise<void> {
	const currentState = get(projectStore);
	if (currentState.currentProject) {
		await loadProject(currentState.currentProject.projectId);
	}
}

/**
 * Clear all project data and reset to initial state
 */
export function clearProjectStore(): void {
	projectStore.set(initialState);
}

/**
 * Update only the current project in store (partial update)
 */
export function updateCurrentProject(updates: Partial<Project>): void {
	projectStore.update((state) => ({
		...state,
		currentProject: state.currentProject ? { ...state.currentProject, ...updates } : null
	}));
}

/**
 * Update WIP summary in store
 */
export function updateWIPSummary(wip: ProjectWIP): void {
	projectStore.update((state) => ({
		...state,
		wipSummary: wip
	}));
}

/**
 * Add a BOM assignment to the store
 */
export function addBomAssignment(assignment: BomAssignment): void {
	projectStore.update((state) => ({
		...state,
		bomAssignments: [...state.bomAssignments, assignment]
	}));
}

/**
 * Add a labor entry to the store
 */
export function addLaborEntry(entry: LaborEntry): void {
	projectStore.update((state) => ({
		...state,
		laborEntries: [...state.laborEntries, entry]
	}));
}

/**
 * Add a finished item to the store
 */
export function addFinishedItem(item: FinishedItem): void {
	projectStore.update((state) => ({
		...state,
		finishedItems: [...state.finishedItems, item]
	}));
}

/**
 * Set error message in store
 */
export function setProjectError(error: string | null): void {
	projectStore.update((state) => ({
		...state,
		error
	}));
}

/**
 * Get read-only reference to store state
 */
export function getProjectState(): ProjectStoreState {
	return get(projectStore);
}
