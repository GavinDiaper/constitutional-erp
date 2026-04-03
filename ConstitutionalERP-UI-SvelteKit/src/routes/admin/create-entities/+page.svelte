<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Tabs from '$lib/components/shared/Tabs.svelte';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	type AdminOperationKey =
		| 'create-position'
		| 'create-assignment'
		| 'create-credential'
		| 'create-authority-rule'
		| 'create-legal-entity'
		| 'create-ledger'
		| 'create-ledger-set'
		| 'create-account'
		| 'create-fiscal-year'
		| 'create-fiscal-period'
		| 'create-segment-definition'
		| 'create-fx-rate-type'
		| 'create-fx-rate'
		| 'create-posting-profile'
		| 'create-combination-rule';

	type AdminTab = 'R2R' | 'H2R' | 'Governance' | 'Legal/Org' | 'FX';

	interface CreateResult {
		operation: string;
		entityType?: string;
		entityId?: string;
		data: unknown;
	}

	interface EmployeeRow {
		employee_id: string;
		name?: string;
	}

	interface PositionRow {
		position_id: string;
		title?: string;
	}

	interface LegalEntityRow {
		legal_entity_id: string;
		name?: string;
	}

	interface LedgerRow {
		ledger_id: string;
		name?: string;
	}

	interface AccountRow {
		account_id: string;
		account_code?: string;
		account_name?: string;
	}

	interface FiscalYearRow {
		fiscal_year_id: string;
		year_label?: string;
	}

	interface FxRateTypeRow {
		rate_type_id: string;
		code?: string;
	}

	interface SegmentDefinitionRow {
		segment_definition_id: string;
		code?: string;
		name?: string;
	}

	let activeTab: AdminTab = 'R2R';
	const tabs: AdminTab[] = ['R2R', 'H2R', 'Governance', 'Legal/Org', 'FX'];

	let runningKey: AdminOperationKey | null = null;
	let errorMessage = '';
	let lastResult: CreateResult | null = null;

	let employees: EmployeeRow[] = [];
	let positions: PositionRow[] = [];
	let legalEntities: LegalEntityRow[] = [];
	let ledgers: LedgerRow[] = [];
	let accounts: AccountRow[] = [];
	let fiscalYears: FiscalYearRow[] = [];
	let fxRateTypes: FxRateTypeRow[] = [];
	let segmentDefinitions: SegmentDefinitionRow[] = [];

	let legalEntityForm = {
		name: '',
		currencyCode: 'USD',
		parentLegalEntityId: ''
	};

	let ledgerForm = {
		name: '',
		currencyCode: 'USD',
		calendar: '',
		chartOfAccountsRef: '',
		legalEntityId: ''
	};

	let ledgerSetForm = {
		name: '',
		description: ''
	};

	let accountForm = {
		accountCode: '',
		accountName: '',
		accountType: 'Asset',
		parentAccountId: ''
	};

	let fiscalYearForm = {
		yearLabel: '',
		startDate: '',
		endDate: ''
	};

	let fiscalPeriodForm = {
		fiscalYearId: '',
		periodNumber: 1,
		startDate: '',
		endDate: ''
	};

	let positionForm = {
		title: '',
		department: '',
		authorityDomain: 'R2R',
		authorityTier: 2
	};

	let assignmentForm = {
		employeeId: '',
		positionId: '',
		startDate: '',
		endDate: '',
		department: '',
		role: ''
	};

	let credentialForm = {
		employeeId: '',
		type: 'FinancialApproval',
		expiryDate: ''
	};

	let authorityRuleForm = {
		domain: 'R2R',
		threshold: 10000,
		requiredTier: 3
	};

	let segmentDefinitionForm = {
		code: '',
		name: '',
		sortOrder: 1,
		isRequired: true
	};

	let fxRateTypeForm = {
		code: '',
		name: '',
		description: ''
	};

	let fxRateForm = {
		rateTypeId: '',
		fromCurrency: 'USD',
		toCurrency: 'AUD',
		rate: 1,
		validFrom: ''
	};

	let postingProfileForm = {
		name: '',
		eventType: 'o2c.invoice.posted',
		debitAccountId: '',
		creditAccountId: '',
		amountSource: 'grossAmount'
	};

	let combinationRuleForm = {
		name: '',
		description: '',
		segmentDefinitionId: '',
		expectedValue: ''
	};

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadLookups();
		});

		void loadLookups();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadLookups(): Promise<void> {
		try {
			const [employeeResult, positionResult, legalEntityResult, ledgerResult, accountResult, fiscalYearResult, fxRateTypeResult, segmentDefinitionResult] =
				await Promise.all([
					queryTable<EmployeeRow>('h2r_employee', $actorStore),
					queryTable<PositionRow>('h2r_position', $actorStore),
					queryTable<LegalEntityRow>('r2r_legal_entity', $actorStore),
					queryTable<LedgerRow>('r2r_ledger', $actorStore),
					queryTable<AccountRow>('r2r_account', $actorStore),
					queryTable<FiscalYearRow>('r2r_fiscal_year', $actorStore),
					queryTable<FxRateTypeRow>('r2r_fx_rate_type', $actorStore),
					queryTable<SegmentDefinitionRow>('r2r_coa_segment_definition', $actorStore)
				]);

			employees = employeeResult.data ?? [];
			positions = positionResult.data ?? [];
			legalEntities = legalEntityResult.data ?? [];
			ledgers = ledgerResult.data ?? [];
			accounts = accountResult.data ?? [];
			fiscalYears = fiscalYearResult.data ?? [];
			fxRateTypes = fxRateTypeResult.data ?? [];
			segmentDefinitions = segmentDefinitionResult.data ?? [];

			if (!ledgerForm.legalEntityId && legalEntities.length > 0) {
				ledgerForm.legalEntityId = legalEntities[0].legal_entity_id;
			}
			if (!accountForm.parentAccountId && accounts.length > 0) {
				accountForm.parentAccountId = accounts[0].account_id;
			}
			if (!fiscalPeriodForm.fiscalYearId && fiscalYears.length > 0) {
				fiscalPeriodForm.fiscalYearId = fiscalYears[0].fiscal_year_id;
			}
			if (!assignmentForm.employeeId && employees.length > 0) {
				assignmentForm.employeeId = employees[0].employee_id;
			}
			if (!assignmentForm.positionId && positions.length > 0) {
				assignmentForm.positionId = positions[0].position_id;
			}
			if (!credentialForm.employeeId && employees.length > 0) {
				credentialForm.employeeId = employees[0].employee_id;
			}
			if (!fxRateForm.rateTypeId && fxRateTypes.length > 0) {
				fxRateForm.rateTypeId = fxRateTypes[0].rate_type_id;
			}
			if (!postingProfileForm.debitAccountId && accounts.length > 0) {
				postingProfileForm.debitAccountId = accounts[0].account_id;
			}
			if (!postingProfileForm.creditAccountId && accounts.length > 1) {
				postingProfileForm.creditAccountId = accounts[1].account_id;
			} else if (!postingProfileForm.creditAccountId && accounts.length === 1) {
				postingProfileForm.creditAccountId = accounts[0].account_id;
			}
			if (!combinationRuleForm.segmentDefinitionId && segmentDefinitions.length > 0) {
				combinationRuleForm.segmentDefinitionId = segmentDefinitions[0].segment_definition_id;
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load admin create lookups.';
		}
	}

	async function runOperation(operation: AdminOperationKey, payload: Record<string, unknown>): Promise<void> {
		runningKey = operation;
		errorMessage = '';

		try {
			const response = await fetch(resolve(`/api/hub/bootstrap/${operation}`), {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || 'Create operation failed.');
			}

			lastResult = (await response.json()) as CreateResult;
			void loadLookups();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Create operation failed.';
			lastResult = null;
		} finally {
			runningKey = null;
		}
	}

	function setActiveTab(tab: string): void {
		if (tab === 'R2R' || tab === 'H2R' || tab === 'Governance' || tab === 'Legal/Org' || tab === 'FX') {
			activeTab = tab;
		}
	}

	function employeeLabel(employee: EmployeeRow): string {
		return employee.name ? `${employee.name} (${employee.employee_id})` : employee.employee_id;
	}

	function positionLabel(position: PositionRow): string {
		return position.title ? `${position.title} (${position.position_id})` : position.position_id;
	}

	function legalEntityLabel(entity: LegalEntityRow): string {
		return entity.name ? `${entity.name} (${entity.legal_entity_id})` : entity.legal_entity_id;
	}

	function accountLabel(account: AccountRow): string {
		const code = account.account_code ?? account.account_id;
		return account.account_name ? `${code} - ${account.account_name}` : code;
	}

	function fxRateTypeLabel(type: FxRateTypeRow): string {
		return type.code ? `${type.code} (${type.rate_type_id})` : type.rate_type_id;
	}

	function segmentDefinitionLabel(definition: SegmentDefinitionRow): string {
		const code = definition.code ?? definition.segment_definition_id;
		return definition.name ? `${code} - ${definition.name}` : code;
	}
</script>

<section>
	<h2 class="text-2xl font-semibold">Create Admin Entities</h2>
	<p class="muted mt-2 text-sm">Create setup and governance entities grouped by domain with prerequisite-aware controls.</p>

	<div class="mt-4">
		<Tabs {tabs} selected={activeTab} onSelect={setActiveTab} />
	</div>

	{#if activeTab === 'R2R'}
		<div class="mt-5 grid gap-3 xl:grid-cols-2">
			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Ledger</h3>
				<div class="mt-3 grid gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Ledger name" bind:value={ledgerForm.name} />
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Currency (USD)" bind:value={ledgerForm.currencyCode} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Calendar (optional)" bind:value={ledgerForm.calendar} />
					</div>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Chart of Accounts Ref (optional)" bind:value={ledgerForm.chartOfAccountsRef} />
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={ledgerForm.legalEntityId}>
						<option value="">No legal entity link</option>
						{#each legalEntities as legalEntity (legalEntity.legal_entity_id)}
							<option value={legalEntity.legal_entity_id}>{legalEntityLabel(legalEntity)}</option>
						{/each}
					</select>
				</div>
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-ledger', ledgerForm)}>
					{runningKey === 'create-ledger' ? 'Creating...' : 'Create Ledger'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Account</h3>
				<div class="mt-3 grid gap-2">
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Account code" bind:value={accountForm.accountCode} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Account name" bind:value={accountForm.accountName} />
					</div>
					<div class="grid grid-cols-2 gap-2">
						<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={accountForm.accountType}>
							<option value="Asset">Asset</option>
							<option value="Liability">Liability</option>
							<option value="Equity">Equity</option>
							<option value="Revenue">Revenue</option>
							<option value="Expense">Expense</option>
						</select>
						<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={accountForm.parentAccountId}>
							<option value="">No parent account</option>
							{#each accounts as account (account.account_id)}
								<option value={account.account_id}>{accountLabel(account)}</option>
							{/each}
						</select>
					</div>
				</div>
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-account', accountForm)}>
					{runningKey === 'create-account' ? 'Creating...' : 'Create Account'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Fiscal Year</h3>
				<div class="mt-3 grid gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="FY label (FY2027)" bind:value={fiscalYearForm.yearLabel} />
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" bind:value={fiscalYearForm.startDate} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" bind:value={fiscalYearForm.endDate} />
					</div>
				</div>
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-fiscal-year', fiscalYearForm)}>
					{runningKey === 'create-fiscal-year' ? 'Creating...' : 'Create Fiscal Year'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Fiscal Period</h3>
				<p class="muted mt-1 text-xs">Requires at least one fiscal year.</p>
				<div class="mt-3 grid gap-2">
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={fiscalPeriodForm.fiscalYearId}>
						<option value="">Select fiscal year</option>
						{#each fiscalYears as fiscalYear (fiscalYear.fiscal_year_id)}
							<option value={fiscalYear.fiscal_year_id}>{fiscalYear.year_label ?? fiscalYear.fiscal_year_id}</option>
						{/each}
					</select>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="1" step="1" placeholder="Period number" bind:value={fiscalPeriodForm.periodNumber} />
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" bind:value={fiscalPeriodForm.startDate} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" bind:value={fiscalPeriodForm.endDate} />
					</div>
				</div>
				{#if fiscalYears.length === 0}
					<p class="muted mt-2 text-xs">Create a fiscal year first.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || fiscalYears.length === 0 || !fiscalPeriodForm.fiscalYearId} on:click={() => runOperation('create-fiscal-period', fiscalPeriodForm)}>
					{runningKey === 'create-fiscal-period' ? 'Creating...' : 'Create Fiscal Period'}
				</button>
			</div>
		</div>
	{/if}

	{#if activeTab === 'H2R'}
		<div class="mt-5 grid gap-3 xl:grid-cols-2">
			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Position</h3>
				<div class="mt-3 grid gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Position title" bind:value={positionForm.title} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Department" bind:value={positionForm.department} />
					<div class="grid grid-cols-2 gap-2">
						<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={positionForm.authorityDomain}>
							<option value="O2C">O2C</option>
							<option value="P2P">P2P</option>
							<option value="R2R">R2R</option>
							<option value="H2R">H2R</option>
						</select>
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="1" max="5" step="1" placeholder="Authority tier" bind:value={positionForm.authorityTier} />
					</div>
				</div>
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-position', positionForm)}>
					{runningKey === 'create-position' ? 'Creating...' : 'Create Position'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Assignment</h3>
				<p class="muted mt-1 text-xs">Requires at least one employee and one position.</p>
				<div class="mt-3 grid gap-2">
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={assignmentForm.employeeId}>
						<option value="">Select employee</option>
						{#each employees as employee (employee.employee_id)}
							<option value={employee.employee_id}>{employeeLabel(employee)}</option>
						{/each}
					</select>
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={assignmentForm.positionId}>
						<option value="">Select position</option>
						{#each positions as position (position.position_id)}
							<option value={position.position_id}>{positionLabel(position)}</option>
						{/each}
					</select>
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" bind:value={assignmentForm.startDate} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" bind:value={assignmentForm.endDate} />
					</div>
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Department" bind:value={assignmentForm.department} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Role" bind:value={assignmentForm.role} />
					</div>
				</div>
				{#if employees.length === 0 || positions.length === 0}
					<p class="muted mt-2 text-xs">Create both employees and positions first.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || employees.length === 0 || positions.length === 0 || !assignmentForm.employeeId || !assignmentForm.positionId} on:click={() => runOperation('create-assignment', assignmentForm)}>
					{runningKey === 'create-assignment' ? 'Creating...' : 'Create Assignment'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Credential</h3>
				<p class="muted mt-1 text-xs">Requires at least one employee.</p>
				<div class="mt-3 grid gap-2">
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={credentialForm.employeeId}>
						<option value="">Select employee</option>
						{#each employees as employee (employee.employee_id)}
							<option value={employee.employee_id}>{employeeLabel(employee)}</option>
						{/each}
					</select>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Credential type" bind:value={credentialForm.type} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" bind:value={credentialForm.expiryDate} />
				</div>
				{#if employees.length === 0}
					<p class="muted mt-2 text-xs">Create an employee first.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || employees.length === 0 || !credentialForm.employeeId} on:click={() => runOperation('create-credential', credentialForm)}>
					{runningKey === 'create-credential' ? 'Creating...' : 'Create Credential'}
				</button>
			</div>
		</div>
	{/if}

	{#if activeTab === 'Governance'}
		<div class="mt-5 grid gap-3 xl:grid-cols-2">
			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Authority Rule</h3>
				<div class="mt-3 grid gap-2">
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={authorityRuleForm.domain}>
						<option value="O2C">O2C</option>
						<option value="P2P">P2P</option>
						<option value="R2R">R2R</option>
						<option value="H2R">H2R</option>
					</select>
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Threshold" bind:value={authorityRuleForm.threshold} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="1" max="5" step="1" placeholder="Required tier" bind:value={authorityRuleForm.requiredTier} />
					</div>
				</div>
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-authority-rule', authorityRuleForm)}>
					{runningKey === 'create-authority-rule' ? 'Creating...' : 'Create Authority Rule'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Posting Profile</h3>
				<p class="muted mt-1 text-xs">Requires two accounts for debit and credit lines.</p>
				<div class="mt-3 grid gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Profile name" bind:value={postingProfileForm.name} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Event type" bind:value={postingProfileForm.eventType} />
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={postingProfileForm.debitAccountId}>
						<option value="">Select debit account</option>
						{#each accounts as account (account.account_id)}
							<option value={account.account_id}>{accountLabel(account)}</option>
						{/each}
					</select>
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={postingProfileForm.creditAccountId}>
						<option value="">Select credit account</option>
						{#each accounts as account (account.account_id)}
							<option value={account.account_id}>{accountLabel(account)}</option>
						{/each}
					</select>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Amount source" bind:value={postingProfileForm.amountSource} />
				</div>
				{#if accounts.length === 0}
					<p class="muted mt-2 text-xs">Create accounts first.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || accounts.length === 0 || !postingProfileForm.debitAccountId || !postingProfileForm.creditAccountId} on:click={() => runOperation('create-posting-profile', postingProfileForm)}>
					{runningKey === 'create-posting-profile' ? 'Creating...' : 'Create Posting Profile'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Combination Rule</h3>
				<p class="muted mt-1 text-xs">Requires at least one segment definition.</p>
				<div class="mt-3 grid gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Rule name" bind:value={combinationRuleForm.name} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Description" bind:value={combinationRuleForm.description} />
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={combinationRuleForm.segmentDefinitionId}>
						<option value="">Select segment definition</option>
						{#each segmentDefinitions as definition (definition.segment_definition_id)}
							<option value={definition.segment_definition_id}>{segmentDefinitionLabel(definition)}</option>
						{/each}
					</select>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Expected value" bind:value={combinationRuleForm.expectedValue} />
				</div>
				{#if segmentDefinitions.length === 0}
					<p class="muted mt-2 text-xs">Create segment definitions first.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || segmentDefinitions.length === 0 || !combinationRuleForm.segmentDefinitionId || !combinationRuleForm.expectedValue} on:click={() => runOperation('create-combination-rule', combinationRuleForm)}>
					{runningKey === 'create-combination-rule' ? 'Creating...' : 'Create Combination Rule'}
				</button>
			</div>
		</div>
	{/if}

	{#if activeTab === 'Legal/Org'}
		<div class="mt-5 grid gap-3 xl:grid-cols-2">
			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Legal Entity</h3>
				<div class="mt-3 grid gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Legal entity name" bind:value={legalEntityForm.name} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Currency (USD)" bind:value={legalEntityForm.currencyCode} />
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={legalEntityForm.parentLegalEntityId}>
						<option value="">No parent legal entity</option>
						{#each legalEntities as legalEntity (legalEntity.legal_entity_id)}
							<option value={legalEntity.legal_entity_id}>{legalEntityLabel(legalEntity)}</option>
						{/each}
					</select>
				</div>
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-legal-entity', legalEntityForm)}>
					{runningKey === 'create-legal-entity' ? 'Creating...' : 'Create Legal Entity'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Ledger Set</h3>
				<p class="muted mt-1 text-xs">{ledgers.length} ledgers available to attach after create.</p>
				<div class="mt-3 grid gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Ledger set name" bind:value={ledgerSetForm.name} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Description" bind:value={ledgerSetForm.description} />
				</div>
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-ledger-set', ledgerSetForm)}>
					{runningKey === 'create-ledger-set' ? 'Creating...' : 'Create Ledger Set'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Segment Definition</h3>
				<div class="mt-3 grid gap-2">
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Code" bind:value={segmentDefinitionForm.code} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Name" bind:value={segmentDefinitionForm.name} />
					</div>
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="1" step="1" placeholder="Sort order" bind:value={segmentDefinitionForm.sortOrder} />
						<label class="flex items-center gap-2 text-xs text-white/80">
							<input type="checkbox" bind:checked={segmentDefinitionForm.isRequired} />
							Required segment
						</label>
					</div>
				</div>
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-segment-definition', segmentDefinitionForm)}>
					{runningKey === 'create-segment-definition' ? 'Creating...' : 'Create Segment Definition'}
				</button>
			</div>
		</div>
	{/if}

	{#if activeTab === 'FX'}
		<div class="mt-5 grid gap-3 xl:grid-cols-2">
			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create FX Rate Type</h3>
				<div class="mt-3 grid gap-2">
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Code" bind:value={fxRateTypeForm.code} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Name" bind:value={fxRateTypeForm.name} />
					</div>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Description" bind:value={fxRateTypeForm.description} />
				</div>
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-fx-rate-type', fxRateTypeForm)}>
					{runningKey === 'create-fx-rate-type' ? 'Creating...' : 'Create FX Rate Type'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create FX Rate</h3>
				<p class="muted mt-1 text-xs">Requires at least one FX rate type.</p>
				<div class="mt-3 grid gap-2">
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={fxRateForm.rateTypeId}>
						<option value="">Select rate type</option>
						{#each fxRateTypes as fxType (fxType.rate_type_id)}
							<option value={fxType.rate_type_id}>{fxRateTypeLabel(fxType)}</option>
						{/each}
					</select>
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="From currency" bind:value={fxRateForm.fromCurrency} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="To currency" bind:value={fxRateForm.toCurrency} />
					</div>
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="0.000001" step="0.000001" placeholder="Rate" bind:value={fxRateForm.rate} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="datetime-local" bind:value={fxRateForm.validFrom} />
					</div>
				</div>
				{#if fxRateTypes.length === 0}
					<p class="muted mt-2 text-xs">Create an FX rate type first.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || fxRateTypes.length === 0 || !fxRateForm.rateTypeId} on:click={() => runOperation('create-fx-rate', fxRateForm)}>
					{runningKey === 'create-fx-rate' ? 'Creating...' : 'Create FX Rate'}
				</button>
			</div>
		</div>
	{/if}

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{/if}

	{#if lastResult}
		<div class="mt-4 rounded-md border border-emerald-500/45 bg-emerald-500/10 p-4 text-sm">
			<p class="font-semibold">{lastResult.operation} completed.</p>
			{#if lastResult.entityType && lastResult.entityId}
				<p class="mt-1">Created {lastResult.entityType} / {lastResult.entityId}</p>
			{/if}
			<div class="mt-3 flex flex-wrap gap-2">
				<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white" href={resolve('/admin')}>
					Back to Admin
				</a>
			</div>
		</div>
	{/if}
</section>
