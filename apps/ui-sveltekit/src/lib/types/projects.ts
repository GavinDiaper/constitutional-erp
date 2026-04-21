// Backend projection types (from foundation-erp schemas)
export interface Project {
	projectId: string;
	name: string;
	description?: string;
	customerId?: string;
	contractId?: string;
	wbsId?: string;
	projectType: 'Internal' | 'Capital' | 'Billable' | 'Service';
	status: 'Draft' | 'Active' | 'OnHold' | 'Completed' | 'Cancelled';
	budgetAmount: number;
	actualCostAmount: number;
	revenueAmount?: number;
	defaultWIPAccountId: string;
	defaultCloseAccountId: string;
	startDate: string;
	endDate?: string;
	projectManagerId: string;
	organizationId: string;
	createdAt: string;
	createdBy: string;
	version: number;
	lastEventAt: string;
	wipMaterialBalance: number;
	wipLaborBalance: number;
	wipTotalBalance: number;
	closedFGCost?: number;
	closedExpenseCost?: number;
}

export interface ProjectWIP {
	wipId: string;
	projectId: string;
	wipMaterialBalance: number;
	wipLaborBalance: number;
	wipOverheadBalance: number;
	wipTotalBalance: number;
	materialLineCount: number;
	laborLineCount: number;
	status: 'Open' | 'Closed';
	closedAt?: string;
	closeCompletionType?: 'FG_Conversion' | 'Expense_Close';
	lastMaterialPostedAt?: string;
	lastLaborPostedAt?: string;
	organizationId: string;
	createdAt: string;
	version: number;
}

export interface BomAssignment {
	assignmentId: string;
	projectId: string;
	wbsId?: string;
	bomId: string;
	quantityPlanned: number;
	status: 'Active' | 'Cancelled';
	createdAt: string;
	updatedAt: string;
}

export interface LaborEntry {
	entryId: string;
	projectId: string;
	wipId: string;
	wbsId?: string;
	resourceId: string;
	hours: number;
	rate: number;
	totalCost: number;
	costElementId?: string;
	postedAt: string;
	createdAt: string;
}

export interface FinishedItem {
	finishedItemId: string;
	projectId: string;
	wipId: string;
	skuId: string;
	organizationId: string;
	quantity: number;
	unitCost: number;
	totalWipCost: number;
	movementId?: string;
	createdAt: string;
}

export interface ProjectRequisition {
	requisitionId: string;
	requester: string;
	department?: string;
	state: string;
	totalAmount: number;
	currencyCode?: string;
	neededByDate?: string;
	legalEntityId?: string;
	projectId?: string;
	wbsId?: string;
	createdAt: string;
	updatedAt: string;
}

export interface ProjectPurchaseOrder {
	poId: string;
	requisitionId?: string;
	supplierId: string;
	state: string;
	totalAmount: number;
	currencyCode?: string;
	deliveryAddress?: string;
	legalEntityId?: string;
	projectId?: string;
	wbsId?: string;
	createdAt: string;
	updatedAt: string;
}

export interface ProjectSalesOrder {
	orderId: string;
	quoteId?: string;
	customerId: string;
	state: string;
	currencyCode: string;
	totalAmount: number;
	legalEntityId?: string;
	projectId?: string;
	wbsId?: string;
	createdAt: string;
	updatedAt: string;
}

export interface ProjectProcurementPreviewLine {
	skuId: string;
	organizationId: string;
	quantityUom: string;
	requiredQuantity: number;
	onHandQuantity: number;
	shortageQuantity: number;
	suggestedUnitPrice: number;
	sourceBomIds: string[];
	sourceAssignmentIds: string[];
}

export interface ProjectProcurementPreview {
	projectId: string;
	generatedAt: string;
	lineCount: number;
	shortageLineCount: number;
	totalRequiredQuantity: number;
	totalShortageQuantity: number;
	lines: ProjectProcurementPreviewLine[];
}

export interface ProjectRequisitionGenerationResult {
	projectId: string;
	requisitionId: string;
	generatedLineCount: number;
	skippedLineCount: number;
	totalShortageQuantity: number;
	preview: ProjectProcurementPreview;
}

// UI types
export interface ProjectDashboard {
	draftCount: number;
	activeCount: number;
	completedCount: number;
}

export interface ProjectListRow {
	projectId: string;
	name: string;
	status: 'Draft' | 'Active' | 'OnHold' | 'Completed' | 'Cancelled';
	budgetAmount: number;
	wipTotalBalance: number;
	managerName: string;
	createdAt: string;
}

export interface ProjectFilter {
	status?: string;
	budgetMin?: number;
	budgetMax?: number;
	dateFrom?: string;
	dateTo?: string;
}

export interface StatusBadgeStyle {
	color: string;
	label: string;
}
