<script lang="ts">
	import { onMount } from 'svelte';
	import { base, resolve } from '$app/paths';
	const frontPageBackgroundUrl = `${base}/images/BusinessIdea.jpg`;
	const linaUrl = `${base}/images/Lina1.png`;
	import EntityOverview from '$lib/components/canvas/EntityOverview.svelte';
	import MermaidDiagram from '$lib/components/shared/MermaidDiagram.svelte';
	import JsonFieldValue from '$lib/components/canvas/JsonFieldValue.svelte';
	import { actorStore, type ActorContext } from '$lib/stores/actorStore';
	import { getApprovalAttentionItems, type ApprovalAttentionItem } from '$lib/api/dashboard';
	import {
		createEntity,
		decide,
		executeAction,
		explainAction,
		getNextSteps,
		getCreateLookups,
		getActions,
		getResource,
		promptCreateEntity,
		rankActions,
		simulateAction,
		type ActionOption,
		type CanonicalResource,
		type DecisionOutcome,
		type ExecutionResult,
		type NextStepSuggestion,
		type NextStepResult,
		type NavigatorCreateOperation,
		type NavigatorCreateResult,
		type NavigatorContext,
		type PromptCreateResult,
		type RankedAction,
		type SimulationResult
	} from '$lib/api/navigator';
	import { queryTable } from '$lib/api/query';

	interface QuickCreatePreset {
		operation: NavigatorCreateOperation;
		label: string;
		domain: (typeof DOMAINS)[number];
		aggregateType: string;
		description: string;
	}

		interface QueryTableDescriptor {
			name?: string;
			primaryKey?: string;
		}

	type CreatePanelTab = 'prompt' | 'quick';

	const DOMAINS = ['P2P', 'O2C', 'R2R', 'H2R', 'INV', 'PROJ'] as const;
	const AGGREGATE_TYPES: Record<(typeof DOMAINS)[number], string[]> = {
		P2P: ['requisition', 'supplier', 'purchase-order', 'goods-receipt', 'supplier-invoice', 'ap-payment'],
		O2C: ['quote', 'sales-order', 'ar-invoice', 'ar-payment'],
		R2R: ['account', 'fiscal-year', 'fiscal-period', 'journal'],
		H2R: ['employee', 'position', 'assignment', 'credential', 'authority-rule'],
		INV: ['sku', 'organization', 'movement', 'reservation', 'bin', 'bom'],
		PROJ: ['project', 'wip', 'bom-assignment', 'labor-entry', 'finished-item']
	};
	const QUICK_CREATE_PRESETS: QuickCreatePreset[] = [
		{
			operation: 'create-supplier',
			label: 'P2P Supplier',
			domain: 'P2P',
			aggregateType: 'supplier',
			description: 'Create a supplier that can be used in purchase order creation.'
		},
		{
			operation: 'create-requisition',
			label: 'P2P Requisition',
			domain: 'P2P',
			aggregateType: 'requisition',
			description: 'Create a draft requisition and continue with Navigator actions.'
		},
		{
			operation: 'create-purchase-order',
			label: 'P2P Purchase Order',
			domain: 'P2P',
			aggregateType: 'purchase-order',
			description: 'Create a purchase order using live supplier lookup.'
		},
		{
			operation: 'create-fiscal-year',
			label: 'R2R Fiscal Year',
			domain: 'R2R',
			aggregateType: 'fiscal-year',
			description: 'Create a fiscal year using live ledger lookup.'
		},
		{
			operation: 'create-fiscal-period',
			label: 'R2R Fiscal Period',
			domain: 'R2R',
			aggregateType: 'fiscal-period',
			description: 'Create a fiscal period using live fiscal-year lookup.'
		},
		{
			operation: 'create-payment',
			label: 'O2C Payment',
			domain: 'O2C',
			aggregateType: 'ar-payment',
			description: 'Register AR payment using live invoice lookup.'
		}
	];

	const AGGREGATE_TABLE_MAP: Record<string, { table: string; idField: string }> = {
		requisition: { table: 'p2p_requisition', idField: 'requisition_id' },
		supplier: { table: 'p2p_supplier', idField: 'supplier_id' },
		'purchase-order': { table: 'p2p_purchase_order', idField: 'po_id' },
		'goods-receipt': { table: 'p2p_goods_receipt', idField: 'receipt_id' },
		'supplier-invoice': { table: 'p2p_supplier_invoice', idField: 'supplier_invoice_id' },
		'ap-payment': { table: 'p2p_ap_payment', idField: 'ap_payment_id' },
		quote: { table: 'o2c_quote', idField: 'quote_id' },
		'sales-order': { table: 'o2c_sales_order', idField: 'order_id' },
		'ar-invoice': { table: 'o2c_invoice', idField: 'invoice_id' },
		'ar-payment': { table: 'o2c_payment', idField: 'payment_id' },
		account: { table: 'r2r_account', idField: 'account_id' },
		'fiscal-year': { table: 'r2r_fiscal_year', idField: 'fiscal_year_id' },
		'fiscal-period': { table: 'r2r_fiscal_period', idField: 'fiscal_period_id' },
		journal: { table: 'r2r_journal', idField: 'journal_id' },
		employee: { table: 'h2r_employee', idField: 'employee_id' },
		position: { table: 'h2r_position', idField: 'position_id' },
		assignment: { table: 'h2r_assignment', idField: 'assignment_id' },
		credential: { table: 'h2r_credential', idField: 'credential_id' },
		'authority-rule': { table: 'h2r_authority_rule', idField: 'authority_rule_id' },
		sku: { table: 'inv_sku', idField: 'sku_id' },
		organization: { table: 'inv_organization', idField: 'organization_id' },
		movement: { table: 'inv_movement', idField: 'movement_id' },
		reservation: { table: 'inv_reservation', idField: 'reservation_id' },
		bin: { table: 'inv_bin', idField: 'bin_id' },
		bom: { table: 'inv_bom_header', idField: 'bom_id' },
		project: { table: 'proj_project', idField: 'project_id' },
		wip: { table: 'proj_wip', idField: 'wip_id' },
		'bom-assignment': { table: 'proj_bom_assignment', idField: 'assignment_id' },
		'labor-entry': { table: 'proj_labor_entry', idField: 'entry_id' },
		'finished-item': { table: 'proj_finished_item', idField: 'finished_item_id' }
	};

	let domain: (typeof DOMAINS)[number] = 'P2P';
	let aggregateType = 'requisition';
	let aggregateId = '';
	let userNote = '';
	let aggregateIdsByLookupKey: Record<string, string[]> = {};
	let aggregateIdLoadingByLookupKey: Record<string, boolean> = {};
	let aggregateIdErrorByLookupKey: Record<string, string> = {};
	let queryTablePrimaryKeys: Record<string, string> = {};
	let createPanelTab: CreatePanelTab = 'prompt';
	let createPresetId: NavigatorCreateOperation = 'create-requisition';
	let createLoading = false;
	let createError = '';
	let createResult: NavigatorCreateResult | null = null;
	let promptCreateText = '';
	let promptCreateLoading = false;
	let promptCreateError = '';
	let promptCreateResult: PromptCreateResult | null = null;
	let nextStepsLoading = false;
	let nextStepsError = '';
	let nextStepsResult: NextStepResult | null = null;
	let nextStepApplyLoadingId = '';
	let nextStepApplyError = '';
	let nextStepApplySuccess = '';
	let approvalsLoading = false;
	let approvalsError = '';
	let approvalItems: ApprovalAttentionItem[] = [];
	let selectedApproval: ApprovalAttentionItem | null = null;

	let supplierLookup: Array<Record<string, unknown>> = [];
	let ledgerLookup: Array<Record<string, unknown>> = [];
	let fiscalYearLookup: Array<Record<string, unknown>> = [];
	let invoiceLookup: Array<Record<string, unknown>> = [];
	let lookupLoading = false;

	let supplierForm = {
		supplierName: 'Navigator Supplier',
		email: 'navigator.supplier@example.local',
		paymentTerms: 'NET30',
		currencyCode: 'USD'
	};

	let requisitionForm = {
		requester: 'principal.system',
		department: 'Operations',
		currencyCode: 'USD'
	};

	let purchaseOrderForm = {
		supplierId: '',
		requisitionId: '',
		totalAmount: 1000,
		currencyCode: 'USD',
		deliveryAddress: '1 Constitutional Way'
	};

	let fiscalYearForm = {
		ledgerId: '',
		year: new Date().getFullYear(),
		startDate: `${new Date().getFullYear()}-01-01`,
		endDate: `${new Date().getFullYear()}-12-31`
	};

	let fiscalPeriodForm = {
		fiscalYearId: '',
		periodNumber: 1,
		startDate: `${new Date().getFullYear()}-01-01`,
		endDate: `${new Date().getFullYear()}-01-31`
	};

	let paymentForm = {
		invoiceId: '',
		amount: 100,
		currencyCode: 'USD',
		method: 'bank-transfer'
	};

	let loading = false;
	let errorMessage = '';
	let resourceLoading = false;
	let resourceError = '';
	let resource: CanonicalResource | null = null;
	let resourceLines: Array<Record<string, unknown>> = [];
	let actionOptions: ActionOption[] = [];

	let rankedActions: RankedAction[] = [];
	let selectedActionId = '';
	let explanation = '';
	let explanationLoading = false;
	let explanationError = '';
	let simulation: SimulationResult | null = null;
	let simulationLoading = false;
	let simulationError = '';
	let decision: DecisionOutcome | null = null;
	let decisionLoading = false;
	let decisionError = '';
	let execution: ExecutionResult | null = null;
	let executionLoading = false;
	let executionError = '';

	$: if (!getAggregateTypeOptions(domain).includes(aggregateType)) {
		aggregateType = getAggregateTypeOptions(domain)[0] ?? '';
	}

	$: if (getAggregateIdOptions(aggregateType).length > 0 && !getAggregateIdOptions(aggregateType).includes(aggregateId)) {
		aggregateId = getAggregateIdOptions(aggregateType)[0] ?? '';
	}

	$: if (createPresetId === 'create-purchase-order' && !purchaseOrderForm.supplierId && supplierLookup.length > 0) {
		purchaseOrderForm.supplierId = String(supplierLookup[0]?.supplier_id ?? '');
	}

	$: if (createPresetId === 'create-fiscal-year' && !fiscalYearForm.ledgerId && ledgerLookup.length > 0) {
		fiscalYearForm.ledgerId = String(ledgerLookup[0]?.ledger_id ?? '');
	}

	$: if (createPresetId === 'create-fiscal-period' && !fiscalPeriodForm.fiscalYearId && fiscalYearLookup.length > 0) {
		fiscalPeriodForm.fiscalYearId = String(fiscalYearLookup[0]?.fiscal_year_id ?? '');
	}

	$: if (createPresetId === 'create-payment' && !paymentForm.invoiceId && invoiceLookup.length > 0) {
		paymentForm.invoiceId = String(invoiceLookup[0]?.invoice_id ?? '');
	}

	function buildAggregateLookupKey(targetAggregateType: string, targetActorId = selectedActor().actorId): string {
		return `${targetActorId}::${targetAggregateType}`;
	}



	function buildContext(): NavigatorContext {
		const actor = selectedActor();
		return {
			domain,
			aggregateType: aggregateType.trim(),
			aggregateId: aggregateId.trim(),
			actorId: actor.actorId,
			userNote: userNote.trim() ? userNote.trim() : undefined
		};
	}

	function getAggregateTypeOptions(currentDomain: (typeof DOMAINS)[number]): string[] {
		return AGGREGATE_TYPES[currentDomain] ?? [];
	}

	function getAllAggregateTypes(): string[] {
		const all = Object.values(AGGREGATE_TYPES).flat();
		return Array.from(new Set(all));
	}

	function getAggregateIdOptions(currentAggregateType: string): string[] {
		return aggregateIdsByLookupKey[buildAggregateLookupKey(currentAggregateType)] ?? [];
	}

	function getAggregateIdLoading(currentAggregateType: string): boolean {
		return aggregateIdLoadingByLookupKey[buildAggregateLookupKey(currentAggregateType)] ?? false;
	}

	function getAggregateIdError(currentAggregateType: string): string {
		return aggregateIdErrorByLookupKey[buildAggregateLookupKey(currentAggregateType)] ?? '';
	}

	function idFromRowByKey(row: Record<string, unknown>, key: string): string {
		const direct = row[key];
		if (typeof direct === 'string' && direct.trim().length > 0) {
			return direct;
		}

		const normalizedKey = key.replace(/_/g, '').toLowerCase();
		for (const [candidateKey, candidateValue] of Object.entries(row)) {
			if (candidateKey.replace(/_/g, '').toLowerCase() === normalizedKey && typeof candidateValue === 'string' && candidateValue.trim().length > 0) {
				return candidateValue;
			}
		}

		return '';
	}

	function inferRowId(row: Record<string, unknown>): string {
		for (const [key, value] of Object.entries(row)) {
			if (/(_id|Id)$/.test(key) && typeof value === 'string' && value.trim().length > 0) {
				return value;
			}
		}

		if (typeof row.id === 'string' && row.id.trim().length > 0) {
			return row.id;
		}

		return '';
	}

	async function loadQueryTableMetadata(): Promise<void> {
		try {
			const actor = selectedActor();
			const response = await queryTable<QueryTableDescriptor>('tables', actor, 500, 0);
			const tableRows = response.data ?? [];
			const primaryKeyMap: Record<string, string> = {};

			for (const row of tableRows) {
				const tableName = typeof row.name === 'string' ? row.name : '';
				const primaryKey = typeof row.primaryKey === 'string' ? row.primaryKey : '';
				if (tableName && primaryKey) {
					primaryKeyMap[tableName] = primaryKey;
				}
			}

			if (Object.keys(primaryKeyMap).length > 0) {
				queryTablePrimaryKeys = primaryKeyMap;
			}
		} catch {
			// Table metadata is optional; ID extraction falls back to static map and key inference.
		}
	}

	function shouldRetryAggregateIdLookup(currentAggregateType: string): boolean {
		return !getAggregateIdLoading(currentAggregateType) && getAggregateIdOptions(currentAggregateType).length === 0;
	}

	async function handleAggregateIdInteract(): Promise<void> {
		if (!shouldRetryAggregateIdLookup(aggregateType)) {
			return;
		}

		await loadAggregateIdsForType(aggregateType);
	}

	async function handleAggregateIdRefresh(): Promise<void> {
		if (!aggregateType.trim()) {
			return;
		}

		await loadAggregateIdsForType(aggregateType);
	}

	async function handleDomainChange(): Promise<void> {
		const domainTypes = getAggregateTypeOptions(domain);
		if (!domainTypes.includes(aggregateType)) {
			aggregateType = domainTypes[0] ?? '';
		}

		await handleAggregateTypeChange();
	}

	async function handleAggregateTypeChange(): Promise<void> {
		aggregateId = '';
		if (!aggregateType.trim()) {
			return;
		}

		await loadAggregateIdsForType(aggregateType);
	}

	function selectedCreatePreset(): QuickCreatePreset | undefined {
		return QUICK_CREATE_PRESETS.find((preset) => preset.operation === createPresetId);
	}

	function lookupLabel(row: Record<string, unknown>, idKey: string, nameKeys: string[]): string {
		const id = String(row[idKey] ?? '');
		for (const key of nameKeys) {
			const value = row[key];
			if (typeof value === 'string' && value.trim().length > 0) {
				return `${value} (${id})`;
			}
		}

		return id;
	}

	function buildCreatePayload(operation: NavigatorCreateOperation): Record<string, unknown> {
		switch (operation) {
			case 'create-supplier':
				return { ...supplierForm };
			case 'create-requisition':
				return { ...requisitionForm };
			case 'create-purchase-order':
				return {
					supplierId: purchaseOrderForm.supplierId,
					requisitionId: purchaseOrderForm.requisitionId || undefined,
					totalAmount: Number(purchaseOrderForm.totalAmount),
					currencyCode: purchaseOrderForm.currencyCode,
					deliveryAddress: purchaseOrderForm.deliveryAddress
				};
			case 'create-fiscal-year':
				return {
					ledgerId: fiscalYearForm.ledgerId,
					year: Number(fiscalYearForm.year),
					startDate: fiscalYearForm.startDate,
					endDate: fiscalYearForm.endDate
				};
			case 'create-fiscal-period':
				return {
					fiscalYearId: fiscalPeriodForm.fiscalYearId,
					periodNumber: Number(fiscalPeriodForm.periodNumber),
					startDate: fiscalPeriodForm.startDate,
					endDate: fiscalPeriodForm.endDate
				};
			case 'create-payment':
				return {
					invoiceId: paymentForm.invoiceId,
					amount: Number(paymentForm.amount),
					currencyCode: paymentForm.currencyCode,
					method: paymentForm.method
				};
		}

		throw new Error(`Unsupported create operation: ${operation}`);
	}

	async function loadCreateLookups(): Promise<void> {
		lookupLoading = true;
		createError = '';

		try {
			const actor = selectedActor();
			const [suppliers, ledgers, fiscalYears, invoices] = await Promise.all([
				getCreateLookups('suppliers', actor),
				getCreateLookups('ledgers', actor),
				getCreateLookups('fiscal-years', actor),
				getCreateLookups('invoices', actor)
			]);

			supplierLookup = suppliers;
			ledgerLookup = ledgers;
			fiscalYearLookup = fiscalYears;
			invoiceLookup = invoices;
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to load create lookups.';
		} finally {
			lookupLoading = false;
		}
	}

	async function loadAggregateIdsForType(targetType: string): Promise<void> {
		const mapping = AGGREGATE_TABLE_MAP[targetType];
		const lookupKey = buildAggregateLookupKey(targetType);
		if (!mapping || aggregateIdLoadingByLookupKey[lookupKey]) {
			return;
		}

		aggregateIdLoadingByLookupKey = {
			...aggregateIdLoadingByLookupKey,
			[lookupKey]: true
		};
		aggregateIdErrorByLookupKey = {
			...aggregateIdErrorByLookupKey,
			[lookupKey]: ''
		};
		try {
			const actor = selectedActor();
			const response = await queryTable<Record<string, unknown>>(mapping.table, actor, 500, 0);
			const effectiveIdField = queryTablePrimaryKeys[mapping.table] ?? mapping.idField;
			const ids = (response.data ?? [])
				.map((row) => {
					const byConfiguredKey = idFromRowByKey(row, effectiveIdField);
					if (byConfiguredKey) {
						return byConfiguredKey;
					}

					return inferRowId(row);
				})
				.filter((id) => id.length > 0);
			aggregateIdsByLookupKey = {
				...aggregateIdsByLookupKey,
				[lookupKey]: Array.from(new Set(ids))
			};

			if (buildAggregateLookupKey(aggregateType) === lookupKey) {
				aggregateId = ids[0] ?? '';
			}
		} catch (err) {
			aggregateIdsByLookupKey = {
				...aggregateIdsByLookupKey,
				[lookupKey]: []
			};
			aggregateIdErrorByLookupKey = {
				...aggregateIdErrorByLookupKey,
				[lookupKey]: err instanceof Error ? err.message : 'Failed to load live aggregate IDs.'
			};
			if (buildAggregateLookupKey(aggregateType) === lookupKey) {
				aggregateId = '';
			}
		} finally {
			aggregateIdLoadingByLookupKey = {
				...aggregateIdLoadingByLookupKey,
				[lookupKey]: false
			};
		}
	}

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void handleAggregateTypeChange();
		});

		void Promise.all([loadCreateLookups(), loadQueryTableMetadata()]).then(async () => {
			const allTypes = getAllAggregateTypes();
			for (const type of allTypes) {
				await loadAggregateIdsForType(type);
			}

			if (!aggregateId && aggregateType.trim()) {
				await loadAggregateIdsForType(aggregateType);
			}
		});

		return unsubscribeActor;
	});

	function registerAggregateId(targetAggregateType: string, id: string): void {
		const lookupKey = buildAggregateLookupKey(targetAggregateType);
		const existing = aggregateIdsByLookupKey[lookupKey] ?? [];
		if (existing.includes(id)) {
			return;
		}

		aggregateIdsByLookupKey = {
			...aggregateIdsByLookupKey,
			[lookupKey]: [id, ...existing]
		};
		aggregateIdErrorByLookupKey = {
			...aggregateIdErrorByLookupKey,
			[lookupKey]: ''
		};
	}

	function clearDownstreamState(): void {
		resourceLines = [];
		actionOptions = [];
		rankedActions = [];
		selectedActionId = '';
		explanation = '';
		explanationError = '';
		simulation = null;
		simulationError = '';
		decision = null;
		decisionError = '';
		execution = null;
		executionError = '';
		approvalItems = [];
		selectedApproval = null;
		approvalsError = '';
	}

	function selectedActor(): ActorContext {
		return $actorStore;
	}

	function resolveLinesHref(resourceType: string, resourceId: string): string | null {
		const normalized = resourceType.toLowerCase();
		if (normalized === 'quote' || normalized === 'o2c_quote') {
			return `/api/v1/o2c/quotes/${resourceId}/lines`;
		}
		if (normalized === 'ar-invoice' || normalized === 'invoice' || normalized === 'o2c_invoice') {
			return `/api/v1/o2c/invoices/${resourceId}/lines`;
		}
		if (normalized === 'requisition' || normalized === 'p2p_requisition') {
			return `/api/v1/p2p/requisitions/${resourceId}/lines`;
		}
		if (normalized === 'purchase-order' || normalized === 'purchaseorder' || normalized === 'p2p_purchase_order') {
			return `/api/v1/p2p/purchase-orders/${resourceId}/lines`;
		}
		if (normalized === 'journal' || normalized === 'r2r_journal') {
			return '/api/v1/query/r2r_journal_line?limit=500&offset=0';
		}

		return null;
	}

	async function loadResourceLines(resourceValue: CanonicalResource): Promise<Array<Record<string, unknown>>> {
		const href = resolveLinesHref(resourceValue.type, resourceValue.id);
		if (!href) {
			return [];
		}

		try {
			const actor = selectedActor();
			const response = await fetch('/api/hub/process/action', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-actor-id': actor.actorId,
					'x-actor-tier': String(actor.authorityTier)
				},
				body: JSON.stringify({ href, method: 'GET' })
			});

			if (!response.ok) {
				return [];
			}

			const payload = await response.json();
			let rows: Array<Record<string, unknown>> = [];
			if (Array.isArray(payload)) {
				rows = payload as Array<Record<string, unknown>>;
			}
			if (Array.isArray(payload?.data)) {
				rows = payload.data as Array<Record<string, unknown>>;
			}

			if (resourceValue.type.toLowerCase() === 'journal') {
				return rows.filter((row) => String(row.journal_id ?? '') === resourceValue.id);
			}

			return rows;
		} catch {
			return [];
		}
	}

	async function handleCreateEntity(): Promise<void> {
		const preset = selectedCreatePreset();
		if (!preset) {
			createError = 'Select a create operation.';
			return;
		}

		createLoading = true;
		createError = '';
		createResult = null;
		resourceError = '';

		try {
			const actor = selectedActor();
			createResult = await createEntity(createPresetId, buildCreatePayload(createPresetId), actor);
			if (createResult.entityId) {
				registerAggregateId(preset.aggregateType, createResult.entityId);
				domain = preset.domain;
				aggregateType = preset.aggregateType;
				aggregateId = createResult.entityId;
				await loadCreateLookups();
				await handleLoadResource();
			}
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Create operation failed.';
		} finally {
			createLoading = false;
		}
	}

	async function handleLoadResource(): Promise<void> {
		if (!aggregateType.trim() || !aggregateId.trim()) {
			resourceError = 'Aggregate type and aggregate ID are required.';
			return;
		}

		resourceLoading = true;
		resourceError = '';
		errorMessage = '';
		resource = null;
		clearDownstreamState();

		try {
			const context = buildContext();
			resource = await getResource(context, selectedActor());
			resourceLines = await loadResourceLines(resource);
			actionOptions = await getActions(context, selectedActor());
		} catch (err) {
			resourceError = err instanceof Error ? err.message : 'Resource request failed.';
		} finally {
			resourceLoading = false;
		}
	}

	function inferContextFromEntityType(entityType: string | undefined): { domain: (typeof DOMAINS)[number]; aggregateType: string } | null {
		const map: Record<string, { domain: (typeof DOMAINS)[number]; aggregateType: string }> = {
			p2p_supplier: { domain: 'P2P', aggregateType: 'supplier' },
			p2p_requisition: { domain: 'P2P', aggregateType: 'requisition' },
			p2p_purchase_order: { domain: 'P2P', aggregateType: 'purchase-order' },
			r2r_fiscal_year: { domain: 'R2R', aggregateType: 'fiscal-year' },
			r2r_fiscal_period: { domain: 'R2R', aggregateType: 'fiscal-period' },
			o2c_payment: { domain: 'O2C', aggregateType: 'ar-payment' },
			inv_sku: { domain: 'INV', aggregateType: 'sku' },
			inv_organization: { domain: 'INV', aggregateType: 'organization' },
			proj_project: { domain: 'PROJ', aggregateType: 'project' }
		};

		if (!entityType) {
			return null;
		}

		return map[entityType] ?? null;
	}

	async function handlePromptCreate(dryRun = false): Promise<void> {
		if (!promptCreateText.trim()) {
			promptCreateError = 'Enter a natural-language create prompt first.';
			return;
		}

		promptCreateLoading = true;
		promptCreateError = '';
		promptCreateResult = null;

		try {
			const actor = selectedActor();
			const context = buildContext();
			promptCreateResult = await promptCreateEntity(
				{
					prompt: promptCreateText.trim(),
					actorId: actor.actorId,
					domain,
					context: {
						domain: context.domain,
						aggregateType: context.aggregateType,
						aggregateId: context.aggregateId,
						resource: resource
							? {
								id: resource.id,
								type: resource.type,
								state: resource.state,
								attributes: resource.attributes
							}
							: undefined
					},
					dryRun
				},
				actor
			);

			if (promptCreateResult.created?.entityId) {
				const inferred = inferContextFromEntityType(promptCreateResult.created.entityType);
				if (inferred) {
					registerAggregateId(inferred.aggregateType, promptCreateResult.created.entityId);
					domain = inferred.domain;
					aggregateType = inferred.aggregateType;
					aggregateId = promptCreateResult.created.entityId;
					await loadCreateLookups();
					await handleLoadResource();
				}
			}
		} catch (err) {
			promptCreateError = err instanceof Error ? err.message : 'Prompt create request failed.';
		} finally {
			promptCreateLoading = false;
		}
	}

	async function handleLoadNextSteps(): Promise<void> {
		nextStepsLoading = true;
		nextStepsError = '';
		nextStepsResult = null;
		nextStepApplyError = '';
		nextStepApplySuccess = '';

		try {
			nextStepsResult = await getNextSteps(buildContext(), selectedActor(), 6);
		} catch (err) {
			nextStepsError = err instanceof Error ? err.message : 'Next-step recommendation request failed.';
		} finally {
			nextStepsLoading = false;
		}
	}

	function buildPromptFromSuggestion(operation: NavigatorCreateOperation): string {
		const basePromptByOperation: Record<NavigatorCreateOperation, string> = {
			'create-supplier': 'Create a new supplier in AED named Next Step Supplier with NET30 terms.',
			'create-requisition': 'Create a requisition for office supplies in USD for Operations department.',
			'create-purchase-order': 'Create a purchase order using the active supplier with realistic delivery address and amount.',
			'create-fiscal-year': 'Create a new fiscal year for the primary ledger with valid start and end dates.',
			'create-fiscal-period': 'Create the next fiscal period for the active fiscal year with valid dates.',
			'create-payment': 'Create an AR payment for an open invoice using bank transfer and a realistic amount.',
			'create-inventory-sku': 'Create a new inventory SKU with moving average valuation and sensible defaults.',
			'create-inventory-organization': 'Create an inventory organization with a clear business name.',
			'create-project': 'Create a project with a manager, budget, and default WIP/close accounts.'
		};

		const aggregateContext = aggregateType.trim() && aggregateId.trim()
			? ` Current context: ${aggregateType} ${aggregateId}.`
			: '';

		return `${basePromptByOperation[operation]}${aggregateContext}`;
	}

	async function handleApplyNextStepSuggestion(suggestion: NextStepSuggestion): Promise<void> {
		nextStepApplyLoadingId = suggestion.stepId;
		nextStepApplyError = '';
		nextStepApplySuccess = '';

		try {
			if (suggestion.kind === 'ACTION') {
				const actionId = suggestion.actionId;
				if (!actionId) {
					throw new Error('Selected action recommendation does not include an actionId.');
				}

				selectedActionId = actionId;
				await handleExplain(actionId);
				await handleExecute(actionId);
				nextStepApplySuccess = `Executed recommended action '${actionId}'.`;
				return;
			}

			const operation = suggestion.operation;
			if (!operation) {
				throw new Error('Selected create recommendation does not include an operation.');
			}

			promptCreateText = buildPromptFromSuggestion(operation);
			await handlePromptCreate(false);
			nextStepApplySuccess = `Submitted create recommendation '${operation}' through prompt-create.`;
		} catch (err) {
			nextStepApplyError = err instanceof Error ? err.message : 'Failed to apply next-step recommendation.';
		} finally {
			nextStepApplyLoadingId = '';
		}
	}

	async function handleLoadApprovals(): Promise<void> {
		approvalsLoading = true;
		approvalsError = '';

		try {
			approvalItems = await getApprovalAttentionItems(selectedActor(), 25);

			if (selectedApproval && !approvalItems.some((item) => item.entityType === selectedApproval?.entityType && item.id === selectedApproval?.id)) {
				selectedApproval = null;
			}
		} catch (err) {
			approvalsError = err instanceof Error ? err.message : 'Approval queue request failed.';
		} finally {
			approvalsLoading = false;
		}
	}

	async function handleSelectApproval(item: ApprovalAttentionItem): Promise<void> {
		selectedApproval = item;
		if (item.entityType === 'p2p_requisition') {
			domain = 'P2P';
			aggregateType = 'requisition';
			aggregateId = item.id;
			await handleLoadResource();
			return;
		}

		if (item.entityType === 'r2r_journal') {
			domain = 'R2R';
			aggregateType = 'journal';
			aggregateId = item.id;
			await handleLoadResource();
		}
	}

	async function handleRank(): Promise<void> {
		if (!aggregateType.trim() || !aggregateId.trim()) {
			errorMessage = 'Aggregate type and aggregate ID are required.';
			return;
		}

		loading = true;
		errorMessage = '';
		rankedActions = [];
		selectedActionId = '';
		explanation = '';
		explanationError = '';
		simulation = null;
		simulationError = '';
		decision = null;
		decisionError = '';
		execution = null;
		executionError = '';

		try {
			const result = await rankActions(buildContext(), selectedActor());
			rankedActions = result.rankedActions ?? [];
			actionOptions = result.actionOptions ?? actionOptions;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Rank request failed.';
		} finally {
			loading = false;
		}
	}

	async function handleExplain(actionId: string | undefined = undefined): Promise<void> {
		explanationLoading = true;
		explanationError = '';
		explanation = '';

		try {
			const result = await explainAction(buildContext(), actionId, selectedActor());
			explanation = result.explanation ?? '';
		} catch (err) {
			explanationError = err instanceof Error ? err.message : 'Explain request failed.';
		} finally {
			explanationLoading = false;
		}
	}

	async function handleSimulate(actionId: string): Promise<void> {
		simulationLoading = true;
		simulationError = '';
		simulation = null;

		try {
			simulation = await simulateAction(buildContext(), actionId, selectedActor());
			selectedActionId = actionId;
		} catch (err) {
			simulationError = err instanceof Error ? err.message : 'Simulate request failed.';
		} finally {
			simulationLoading = false;
		}
	}

	async function handleDecide(): Promise<void> {
		decisionLoading = true;
		decisionError = '';
		decision = null;

		try {
			decision = await decide(buildContext(), selectedActor());
		} catch (err) {
			decisionError = err instanceof Error ? err.message : 'Decide request failed.';
		} finally {
			decisionLoading = false;
		}
	}

	async function handleExecute(actionId?: string): Promise<void> {
		executionLoading = true;
		executionError = '';
		execution = null;

		const candidateAction = actionId ?? decision?.action?.actionId ?? selectedActionId;
		const actionToExecute = candidateAction ? candidateAction : undefined;

		try {
			execution = await executeAction(buildContext(), actionToExecute, selectedActor());
			if (execution.mode === 'REQUEST_APPROVAL') {
				await handleLoadApprovals();
			}
		} catch (err) {
			executionError = err instanceof Error ? err.message : 'Execute request failed.';
		} finally {
			executionLoading = false;
		}
	}

	function optionForAction(actionId: string): ActionOption | undefined {
		return actionOptions.find((option) => option.id === actionId);
	}

	function generateMermaidSankey(): string {
		if (!rankedActions || rankedActions.length === 0) {
			return '';
		}

		// Normalize scores to visible widths (0.1 to 10 scale for better visualization)
		const maxScore = Math.max(...rankedActions.map((a) => a.score || 0), 0.01);
		const minScore = Math.min(...rankedActions.map((a) => a.score || 0), 0.01);
		const scoreRange = maxScore - minScore || 0.01;

		const lines: string[] = [
			'---',
			'config:',
			'  sankey:',
			'    showValues: false',
			'---',
			'sankey-beta'
		];

		// Create flows from aggregateType to each action with score as thickness
		for (const action of rankedActions) {
			const normalizedScore = ((action.score || 0) - minScore) / scoreRange * 9 + 1;
			const roundedScore = Math.round(normalizedScore * 10) / 10;
			lines.push(`${aggregateType},${action.actionId},${roundedScore}`);
		}

		return lines.join('\n');
	}
</script>

<section class="glass-panel relative overflow-hidden p-6">
	<img
		class="pointer-events-none absolute right-4 top-4 w-36 opacity-80 md:w-44"
		src={linaUrl}
		alt=""
	/>
	<h2 class="text-2xl font-semibold">Navigator AI</h2>
	<p class="muted mt-2 text-sm">Run the full Navigator workflow with domain-aligned dropdowns and Postman-compatible fixture values.</p>
<section class="glass-panel relative overflow-hidden p-6">
	<div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
		<div>
			<label class="mb-1 block text-xs dark:text-white/70 text-slate-600" for="nav-domain">Domain</label>
			<select
				id="nav-domain"
				class="w-full rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm"
				bind:value={domain}
				on:change={() => void handleDomainChange()}
			>
					{#each DOMAINS as d (d)}
						<option value={d}>{d}</option>
					{/each}
			</select>
		</div>

		<div>
			<label class="mb-1 block text-xs dark:text-white/70 text-slate-600" for="nav-aggregate-type">Aggregate Type</label>
			<select
				id="nav-aggregate-type"
				class="w-full rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm"
				bind:value={aggregateType}
				on:change={() => void handleAggregateTypeChange()}
			>
				{#each getAggregateTypeOptions(domain) as type (type)}
					<option value={type}>{type}</option>
				{/each}
			</select>
		</div>

		<div>
			<div class="mb-1 flex items-center gap-2">
				<label class="block text-xs dark:text-white/70 text-slate-600" for="nav-aggregate-id">Aggregate ID</label>
				<!-- <button
					type="button"
					class="rounded border dark:border-white/25 border-slate-300 px-2 py-0.5 text-[11px] dark:text-white/70 text-slate-600 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
					disabled={getAggregateIdLoading(aggregateType)}
					on:click={() => void handleAggregateIdRefresh()}
				>
					{getAggregateIdLoading(aggregateType) ? 'Refreshing...' : 'Refresh IDs'}
				</button>
				{#if getAggregateIdLoading(aggregateType)}
					<span class="inline-flex items-center gap-2 text-[11px] dark:text-white/55 text-slate-500">
						<span class="h-3 w-3 animate-spin rounded-full border dark:border-white/25 border-slate-300 border-t-white/80"></span>
						Loading live data
					</span>
				{/if} -->
			</div>
			<select
				id="nav-aggregate-id"
				class="w-full rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm"
				disabled={getAggregateIdLoading(aggregateType)}
				bind:value={aggregateId}
				on:click={() => void handleAggregateIdInteract()}
				on:focus={() => void handleAggregateIdInteract()}
			>
				{#if getAggregateIdLoading(aggregateType)}
					<option value="">Loading live aggregate IDs...</option>
				{:else if getAggregateIdOptions(aggregateType).length > 0}
					{#each getAggregateIdOptions(aggregateType) as id (id)}
						<option value={id}>{id}</option>
					{/each}
				{:else if getAggregateIdError(aggregateType)}
					<option value="">Unable to load aggregate IDs</option>
				{:else}
					<option value="">No live aggregates found</option>
				{/if}
			</select>
			{#if getAggregateIdError(aggregateType)}
				<p class="mt-2 text-xs text-red-200">{getAggregateIdError(aggregateType)}</p>
			{:else if !getAggregateIdLoading(aggregateType) && getAggregateIdOptions(aggregateType).length === 0}
				<p class="mt-2 text-xs dark:text-white/55 text-slate-500">No live aggregate IDs are available for this type yet. Click the dropdown to retry.</p>
			{/if}
		</div>



		<div class="flex justify-start items-end">
			<button
				class="w-full rounded-md border dark:border-white/35 border-slate-300 px-4 py-2 text-sm dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
				disabled={resourceLoading || getAggregateIdLoading(aggregateType) || !aggregateId.trim()}
				on:click={handleLoadResource}
			>
				{resourceLoading ? 'Loading...' : 'Load Resource'}
			</button>
		</div>



		<div class="flex justify-start items-end">
			<button
				class="w-full rounded-md border dark:border-white/35 border-slate-300 px-4 py-2 text-sm dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
				disabled={loading || getAggregateIdLoading(aggregateType) || !aggregateId.trim()}
				on:click={handleRank}
			>
				{loading ? 'Ranking...' : 'Propose Actions'}
			</button>
		</div>
	</div>

	<p class="mt-3 text-xs dark:text-white/55 text-slate-500">
		Aggregate IDs load from live data for the actor selected in the header and the chosen aggregate type.
	</p>
</section>
	<div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
		<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h3 class="text-sm font-semibold uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">Create</h3>
					<p class="mt-2 text-sm dark:text-white/75 text-slate-700">
						Use natural language or typed fields to create a new aggregate, then continue directly in Navigator on the created entity.
					</p>
				</div>
				<a class="text-xs dark:text-white/60 text-slate-500 dark:hover:text-white text-slate-900" href={resolve('/canvas/create')}>
					Open Full Create Workspace &rarr;
				</a>
			</div>

			<div class="mt-4 inline-flex rounded-md border dark:border-white/15 border-slate-200 dark:bg-[#0e2038] bg-slate-200/60 p-1">
				<button
					class={`rounded px-3 py-2 text-sm transition ${createPanelTab === 'prompt' ? 'dark:bg-white/15 bg-slate-500/15 dark:text-white text-slate-900' : 'dark:text-white/65 text-slate-600 dark:hover:bg-white/10 hover:bg-slate-500/10 dark:hover:text-white text-slate-900'}`}
					on:click={() => (createPanelTab = 'prompt')}
				>
					Prompt Create
				</button>
				<button
					class={`rounded px-3 py-2 text-sm transition ${createPanelTab === 'quick' ? 'dark:bg-white/15 bg-slate-500/15 dark:text-white text-slate-900' : 'dark:text-white/65 text-slate-600 dark:hover:bg-white/10 hover:bg-slate-500/10 dark:hover:text-white text-slate-900'}`}
					on:click={() => (createPanelTab = 'quick')}
				>
					Quick Create
				</button>
			</div>

			{#if createPanelTab === 'prompt'}
				<p class="mt-3 text-sm dark:text-white/75 text-slate-700">
					Use natural language to resolve a create operation and payload. Example: create a new supplier in UAE named Gulf Trading with NET45 terms in AED.
				</p>
				<textarea
					class="mt-3 min-h-[88px] w-full rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm dark:text-white text-slate-900"
					placeholder="Describe what to create..."
					bind:value={promptCreateText}
				></textarea>
				<div class="mt-3 flex flex-wrap gap-3">
					<button
						class="rounded-md border dark:border-white/35 border-slate-300 px-4 py-2 text-sm dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
						disabled={promptCreateLoading}
						on:click={() => void handlePromptCreate(true)}
					>
						{promptCreateLoading ? 'Resolving...' : 'Resolve Only'}
					</button>
					<button
						class="rounded-md border border-emerald-400/55 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-50"
						disabled={promptCreateLoading}
						on:click={() => void handlePromptCreate(false)}
					>
						{promptCreateLoading ? 'Creating...' : 'Resolve + Create'}
					</button>
				</div>

				{#if promptCreateError}
					<p class="mt-3 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{promptCreateError}</p>
				{/if}

				{#if promptCreateResult}
					<div class="mt-3 rounded-md border dark:border-white/15 border-slate-200 dark:bg-[#0e2038] bg-slate-200/60 p-3 text-sm dark:text-white/90 text-slate-800">
						<p><span class="dark:text-white/65 text-slate-600">Status:</span> {promptCreateResult.status}</p>
						<p><span class="dark:text-white/65 text-slate-600">Operation:</span> {promptCreateResult.resolution.operation}</p>
						{#if promptCreateResult.resolution.missingFields.length > 0}
							<p><span class="dark:text-white/65 text-slate-600">Missing:</span> {promptCreateResult.resolution.missingFields.join(', ')}</p>
						{/if}
						{#if promptCreateResult.resolution.clarification}
							<p class="mt-1 text-amber-200">{promptCreateResult.resolution.clarification}</p>
						{/if}
						{#if promptCreateResult.created?.entityId}
							<p class="mt-1 text-emerald-200">Created: {promptCreateResult.created.entityType} / {promptCreateResult.created.entityId}</p>
						{/if}
					</div>
				{/if}
			{:else}
				<p class="mt-3 text-sm dark:text-white/75 text-slate-700">
					Create a new aggregate through the existing bootstrap flow, then continue directly in Navigator on the created entity.
				</p>

				<div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
					<div>
						<label class="mb-1 block text-xs dark:text-white/70 text-slate-600" for="nav-create-preset">Entity Preset</label>
						<select
							id="nav-create-preset"
							class="w-full rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm"
							bind:value={createPresetId}
						>
							{#each QUICK_CREATE_PRESETS as preset (preset.operation)}
								<option value={preset.operation}>{preset.label}</option>
							{/each}
						</select>
						<p class="mt-2 text-xs dark:text-white/55 text-slate-500">{selectedCreatePreset()?.description}</p>
					</div>

					<div>
						{#if createPresetId === 'create-supplier'}
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Supplier Name" bind:value={supplierForm.supplierName} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Email" bind:value={supplierForm.email} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Payment Terms" bind:value={supplierForm.paymentTerms} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Currency" bind:value={supplierForm.currencyCode} />
							</div>
						{:else if createPresetId === 'create-requisition'}
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Requester" bind:value={requisitionForm.requester} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Department" bind:value={requisitionForm.department} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Currency" bind:value={requisitionForm.currencyCode} />
							</div>
						{:else if createPresetId === 'create-purchase-order'}
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={purchaseOrderForm.supplierId}>
									{#each supplierLookup as supplier (String(supplier.supplier_id ?? ''))}
										<option value={String(supplier.supplier_id ?? '')}>{lookupLabel(supplier, 'supplier_id', ['supplier_name', 'name'])}</option>
									{/each}
								</select>
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Requisition Id (optional)" bind:value={purchaseOrderForm.requisitionId} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Total Amount" bind:value={purchaseOrderForm.totalAmount} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Currency" bind:value={purchaseOrderForm.currencyCode} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm sm:col-span-2" placeholder="Delivery Address" bind:value={purchaseOrderForm.deliveryAddress} />
							</div>
						{:else if createPresetId === 'create-fiscal-year'}
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={fiscalYearForm.ledgerId}>
									{#each ledgerLookup as ledger (String(ledger.ledger_id ?? ''))}
										<option value={String(ledger.ledger_id ?? '')}>{lookupLabel(ledger, 'ledger_id', ['name'])}</option>
									{/each}
								</select>
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" type="number" min="2000" max="2100" bind:value={fiscalYearForm.year} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" type="date" bind:value={fiscalYearForm.startDate} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" type="date" bind:value={fiscalYearForm.endDate} />
							</div>
						{:else if createPresetId === 'create-fiscal-period'}
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={fiscalPeriodForm.fiscalYearId}>
									{#each fiscalYearLookup as fiscalYear (String(fiscalYear.fiscal_year_id ?? ''))}
										<option value={String(fiscalYear.fiscal_year_id ?? '')}>{lookupLabel(fiscalYear, 'fiscal_year_id', ['name'])}</option>
									{/each}
								</select>
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" type="number" min="1" max="16" bind:value={fiscalPeriodForm.periodNumber} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" type="date" bind:value={fiscalPeriodForm.startDate} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" type="date" bind:value={fiscalPeriodForm.endDate} />
							</div>
						{:else if createPresetId === 'create-payment'}
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={paymentForm.invoiceId}>
									{#each invoiceLookup as invoice (String(invoice.invoice_id ?? ''))}
										<option value={String(invoice.invoice_id ?? '')}>{lookupLabel(invoice, 'invoice_id', ['state'])}</option>
									{/each}
								</select>
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" type="number" min="0" step="0.01" bind:value={paymentForm.amount} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Currency" bind:value={paymentForm.currencyCode} />
								<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Method" bind:value={paymentForm.method} />
							</div>
						{/if}
						<p class="mt-1 text-xs dark:text-white/55 text-slate-500">Typed fields are backed by Navigator lookup endpoints for prerequisites.</p>
					</div>
				</div>

				<div class="mt-4 flex flex-wrap gap-3">
					<button
						class="rounded-md border dark:border-white/35 border-slate-300 px-4 py-2 text-sm dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
						disabled={lookupLoading}
						on:click={() => void loadCreateLookups()}
					>
						{lookupLoading ? 'Refreshing lookups...' : 'Refresh Lookups'}
					</button>
					<button
						class="rounded-md border dark:border-white/35 border-slate-300 px-4 py-2 text-sm dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
						disabled={createLoading}
						on:click={handleCreateEntity}
					>
						{createLoading ? 'Creating...' : 'Create Entity In Navigator'}
					</button>
				</div>

				{#if createError}
					<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{createError}</p>
				{/if}

				{#if createResult}
					<div class="mt-4 rounded-md border border-emerald-500/35 bg-emerald-500/10 p-3 text-sm text-emerald-100">
						<p class="font-semibold">Create Succeeded</p>
						<p class="mt-1">{createResult.operation} created {createResult.entityType ?? 'entity'} / {createResult.entityId ?? 'unknown-id'}.</p>
					</div>
				{/if}
			{/if}
		</div>
<section class="glass-panel relative overflow-hidden p-6">


		<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
			<img
		class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15"
		src={frontPageBackgroundUrl}
		alt=""
	/>
			<h3 class="text-sm font-semibold uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">Next Step Recommender</h3>
			<p class="mt-2 text-sm dark:text-white/75 text-slate-700">
				Generate history-aware recommendations that combine available actions and logical create-operation progression.
			</p>
			<div class="mt-3 flex flex-wrap gap-3">
				<button
					class="rounded-md border dark:border-white/35 border-slate-300 px-4 py-2 text-sm dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
					disabled={nextStepsLoading}
					on:click={handleLoadNextSteps}
				>
					{nextStepsLoading ? 'Analyzing...' : 'Suggest Next Steps'}
				</button>
			</div>

			{#if nextStepsError}
				<p class="mt-3 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{nextStepsError}</p>
			{/if}

			{#if nextStepsResult}
				<p class="mt-3 text-xs dark:text-white/60 text-slate-500">
					Events analyzed: {nextStepsResult.historySignals.eventCount} | Recent entity created: {nextStepsResult.historySignals.hasRecentEntityCreated ? 'yes' : 'no'}
				</p>
				{#if nextStepApplyError}
					<p class="mt-3 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{nextStepApplyError}</p>
				{/if}
				{#if nextStepApplySuccess}
					<p class="mt-3 rounded-md border border-emerald-500/55 bg-emerald-500/10 p-3 text-sm text-emerald-100">{nextStepApplySuccess}</p>
				{/if}
				<ul class="mt-3 space-y-2">
					{#each nextStepsResult.suggestions as suggestion (suggestion.stepId)}
						<li>
							<button
								type="button"
								class="w-full rounded-md border dark:border-white/15 border-slate-200 dark:bg-[#0e2038] bg-slate-200/60 p-3 text-left text-sm transition dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
								on:click={() => void handleApplyNextStepSuggestion(suggestion)}
								disabled={nextStepApplyLoadingId.length > 0}
							>
								<p class="font-semibold dark:text-white/90 text-slate-800">
									{suggestion.kind === 'ACTION' ? `Action: ${suggestion.actionId}` : `Create: ${suggestion.operation}`}
									<span class="ml-2 text-xs dark:text-white/60 text-slate-500">score {suggestion.score.toFixed(2)}</span>
								</p>
								<p class="mt-1 dark:text-white/75 text-slate-700">{suggestion.rationale}</p>
								{#if suggestion.prerequisites.length > 0}
									<p class="mt-1 text-xs dark:text-white/55 text-slate-500">Prerequisites: {suggestion.prerequisites.join(', ')}</p>
								{/if}
								<p class="mt-2 text-xs dark:text-white/50 text-slate-500">
									{#if nextStepApplyLoadingId === suggestion.stepId}
										Applying recommendation...
									{:else}
										Click to apply this recommendation
									{/if}
								</p>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div></section>
	</div>

	<div class="mt-6 rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
		<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
			<div>
				<h3 class="text-sm font-semibold uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">Approval Queue</h3>
				<p class="mt-2 text-sm dark:text-white/75 text-slate-700">
					Draft customer activations, submitted requisitions, and pending journals requiring operator attention.
				</p>
			</div>
			<div class="flex flex-wrap gap-3">
				<span class="rounded-full dark:bg-white/10 bg-slate-500/10 px-3 py-2 text-xs font-semibold dark:text-white/85 text-slate-700">Dashboard Method</span>
				<button
					class="rounded-md border dark:border-white/35 border-slate-300 px-4 py-2 text-sm dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
					disabled={approvalsLoading}
					on:click={handleLoadApprovals}
				>
					{approvalsLoading ? 'Loading...' : 'Load Approvals'}
				</button>
			</div>
		</div>

		{#if approvalsError}
			<p class="mt-3 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{approvalsError}</p>
		{/if}

		<div class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
			<div>
				{#if approvalItems.length === 0}
					<p class="rounded-md border dark:border-white/10 border-slate-200 dark:bg-[#0e2038] bg-slate-200/60 p-3 text-sm dark:text-white/70 text-slate-600">No entities currently requiring attention.</p>
				{:else}
					<ul class="space-y-2">
						{#each approvalItems as approval (approval.entityType + '-' + approval.id)}
							<li>
								<button
									class={`w-full rounded-md border px-3 py-3 text-left text-sm transition dark:hover:bg-white/10 hover:bg-slate-500/10 ${selectedApproval?.entityType === approval.entityType && selectedApproval?.id === approval.id ? 'border-emerald-400/55 bg-emerald-500/10' : 'dark:border-white/15 border-slate-200 dark:bg-[#0e2038] bg-slate-200/60'}`}
									on:click={() => void handleSelectApproval(approval)}
								>
									<p class="font-mono text-xs dark:text-white/80 text-slate-700">{approval.id}</p>
									<p class="mt-1 dark:text-white/90 text-slate-800">
										{approval.entityType === 'o2c_customer' ? 'Customer Activation' : approval.entityType === 'p2p_requisition' ? 'Submitted Requisition' : 'Pending Journal'}
									</p>
									<p class="mt-1 text-xs dark:text-white/65 text-slate-600">{approval.ownerLabel}</p>
									<p class="mt-1 text-xs dark:text-white/60 text-slate-500">State {approval.stateLabel}</p>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-[#0e2038] bg-slate-200/60 p-4">
				<h4 class="text-sm font-semibold dark:text-white/90 text-slate-800">Attention Detail</h4>
				{#if selectedApproval}
					<div class="mt-3 space-y-2 text-sm">
						<p><span class="dark:text-white/60 text-slate-500">Entity:</span> {selectedApproval.entityType}</p>
						<p><span class="dark:text-white/60 text-slate-500">ID:</span> {selectedApproval.id}</p>
						<p><span class="dark:text-white/60 text-slate-500">Owner/Context:</span> {selectedApproval.ownerLabel}</p>
						<p><span class="dark:text-white/60 text-slate-500">State:</span> {selectedApproval.stateLabel}</p>
						{#if selectedApproval.createdAt}
							<p><span class="dark:text-white/60 text-slate-500">Created:</span> {selectedApproval.createdAt}</p>
						{/if}
					</div>
					<p class="mt-4 text-xs dark:text-white/60 text-slate-500">
						Navigator now uses the dashboard attention queue method for this panel. Approval resolution actions will be added next.
					</p>
				{:else}
					<p class="mt-3 text-sm dark:text-white/65 text-slate-600">Select an attention entity to inspect it.</p>
				{/if}
			</div>
		</div>
	</div>

	<div class="mt-4">
		<label class="mb-1 block text-xs dark:text-white/70 text-slate-600" for="nav-user-note">Operator Note</label>
		<textarea
			id="nav-user-note"
			class="min-h-[92px] w-full rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm dark:text-white text-slate-900"
			placeholder="Optional context for the AI, e.g. 'Line for X missing for N at Y AED; likely next action is add-line.'"
			bind:value={userNote}
		></textarea>
		<p class="mt-1 text-xs dark:text-white/55 text-slate-500">
			This note is sent to Navigator and can influence ranking, explanation, simulation, decisioning, and execution payload context.
		</p>
	</div>

	{#if resourceError}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{resourceError}</p>
	{/if}

	{#if resource}
		<div class="mt-6 rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
			<h3 class="text-sm font-semibold uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">Canonical Resource</h3>
			<p class="mt-2 text-sm font-medium">
				{resource.domain} / {resource.type} / {resource.id} (state: {resource.state})
			</p>

			<div class="mt-3">
				<EntityOverview
					attributes={{
						...(resource.attributes ?? {}),
						__entityType: resource.type,
						__lines: resourceLines
					}}
				/>
			</div>
		</div>
	{/if}

	{#if actionOptions.length > 0}
		<div class="mt-6">
			<h3 class="mb-3 text-sm font-semibold uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">Available Actions</h3>
			<div class="overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
							<th class="px-3 py-2">Action</th>
							<th class="px-3 py-2">Method</th>
							<th class="px-3 py-2">Requires Approval</th>
							<th class="px-3 py-2">Required Tier</th>
						</tr>
					</thead>
					<tbody>
						{#each actionOptions as option (option.id)}
							<tr class="border-b dark:border-white/10 border-slate-200">
								<td class="px-3 py-3 font-mono text-xs">{option.id}</td>
								<td class="px-3 py-3 text-xs">{option.method}</td>
								<td class="px-3 py-3 text-xs">{option.requiresApproval ? 'Yes' : 'No'}</td>
								<td class="px-3 py-3 text-xs">{option.requiredTier ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{/if}

	{#if rankedActions.length > 0}
		<div class="mt-6">
			<h3 class="mb-3 text-sm font-semibold uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">Ranked Actions</h3>
			
			<!-- Mermaid Sankey Diagram -->
			<div class="mb-6 rounded-md border dark:border-white/10 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
				<p class="mb-3 text-xs uppercase tracking-[0.15em] dark:text-white/60 text-slate-500">Action Flow (Score Distribution)</p>
				<MermaidDiagram definition={generateMermaidSankey()} title="Action Score Distribution" showFullscreenToggle={false} />
				<p class="mt-2 text-xs dark:text-white/50 text-slate-500">Flow width represents normalized action score (thickness = recommendation strength)</p>
			</div>

			<div class="overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
							<th class="px-3 py-2">Rank</th>
							<th class="px-3 py-2">Action</th>
							<th class="px-3 py-2">Score</th>
							<th class="px-3 py-2">Approval</th>
							<th class="px-3 py-2">Tier</th>
							<th class="px-3 py-2">Rationale</th>
							<th class="px-3 py-2">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each rankedActions as action, index (action.actionId)}
							{@const option = optionForAction(action.actionId)}
							<tr class="border-b dark:border-white/10 border-slate-200">
								<td class="px-3 py-3 text-xs">{index + 1}</td>
								<td class="px-3 py-3 font-mono text-xs">{action.actionId}</td>
								<td class="px-3 py-3 text-xs">{action.score != null ? action.score.toFixed(2) : '—'}</td>
								<td class="px-3 py-3 text-xs">{option?.requiresApproval ? 'Yes' : 'No'}</td>
								<td class="px-3 py-3 text-xs">{option?.requiredTier ?? '—'}</td>
								<td class="px-3 py-3 text-xs dark:text-white/70 text-slate-600">{action.rationale ?? '—'}</td>
								<td class="px-3 py-3">
									<div class="flex flex-wrap gap-2">
										<button
											class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
											disabled={explanationLoading}
											on:click={() => { selectedActionId = action.actionId; void handleExplain(action.actionId); }}
										>
											Explain
										</button>
										<button
											class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
											disabled={simulationLoading}
											on:click={() => void handleSimulate(action.actionId)}
										>
											Simulate
										</button>
										<button
											class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
											disabled={decisionLoading}
											on:click={() => { selectedActionId = action.actionId; void handleDecide(); }}
										>
											Decide
										</button>
										<button
											class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
											disabled={executionLoading}
											on:click={() => void handleExecute(action.actionId)}
										>
											Execute
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="mt-3 flex gap-2">
				<button
					class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
					disabled={explanationLoading}
					on:click={() => { selectedActionId = ''; void handleExplain(); }}
				>
					{explanationLoading ? 'Loading...' : 'Explain All (Overview)'}
				</button>
				<button
					class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
					disabled={decisionLoading}
					on:click={handleDecide}
				>
					{decisionLoading ? 'Deciding...' : 'Run Decide'}
				</button>
			</div>
		</div>
	{/if}

	{#if explanationError}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{explanationError}</p>
	{/if}

	{#if explanation}
		<div class="mt-4 rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
			<p class="mb-1 text-xs dark:text-white/60 text-slate-500">
				Explanation{selectedActionId ? ` for ${selectedActionId}` : ' (overview)'}
			</p>
			<p class="text-sm leading-relaxed">{explanation}</p>
		</div>
	{/if}

	{#if simulationError}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{simulationError}</p>
	{/if}

	{#if simulation}
		<div class="mt-4 rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
			<p class="mb-2 text-xs dark:text-white/60 text-slate-500">Simulation{selectedActionId ? ` for ${selectedActionId}` : ''}</p>
			<div class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
				<p><span class="dark:text-white/60 text-slate-500">Predicted State:</span> {simulation.predictedState}</p>
				<p><span class="dark:text-white/60 text-slate-500">Risk:</span> {simulation.riskSummary}</p>
				<p><span class="dark:text-white/60 text-slate-500">Financial Impact:</span> {simulation.financialImpact ?? 'n/a'}</p>
				<p><span class="dark:text-white/60 text-slate-500">Transitions:</span> {simulation.predictedTransitions.join(', ') || 'n/a'}</p>
			</div>
			<p class="mt-3 text-sm leading-relaxed dark:text-white/90 text-slate-800">{simulation.narrative}</p>
		</div>
	{/if}

	{#if decisionError}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{decisionError}</p>
	{/if}

	{#if decision}
		<div class="mt-4 rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
			<p class="mb-1 text-xs dark:text-white/60 text-slate-500">Decision</p>
			<p class="text-sm"><span class="dark:text-white/60 text-slate-500">Mode:</span> {decision.mode}</p>
			<p class="text-sm"><span class="dark:text-white/60 text-slate-500">Chosen Action:</span> {decision.action?.actionId ?? 'none'}</p>
			<p class="mt-2 text-sm leading-relaxed">{decision.explanation}</p>
			{#if decision.mode === 'EXECUTE' || decision.mode === 'REQUEST_APPROVAL'}
				<button
					class="mt-3 rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-50"
					disabled={executionLoading}
					on:click={() => void handleExecute(decision?.action?.actionId)}
				>
					{executionLoading ? 'Executing...' : 'Execute Decision Action'}
				</button>
			{/if}
		</div>
	{/if}

	{#if executionError}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{executionError}</p>
	{/if}

	{#if execution}
		<div class="mt-4 rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
			<p class="mb-1 text-xs dark:text-white/60 text-slate-500">Execution Result</p>
			<p class="text-sm"><span class="dark:text-white/60 text-slate-500">Mode:</span> {execution.mode}</p>
			<p class="text-sm"><span class="dark:text-white/60 text-slate-500">Action:</span> {execution.actionId}</p>
			<p class="text-sm"><span class="dark:text-white/60 text-slate-500">Status:</span> {execution.statusCode}</p>
			<div class="mt-3">
				<JsonFieldValue value={execution.responseBody} />
			</div>
		</div>
	{/if}

	<div class="mt-8 border-t dark:border-white/10 border-slate-200 pt-4">
		<a
			class="text-xs dark:text-white/60 text-slate-500 dark:hover:text-white text-slate-900"
			href={resolve('/navigator/sessions')}
		>
			View Navigator Sessions &rarr;
		</a>
	</div>
</section>
