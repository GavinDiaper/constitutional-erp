import { json } from '@sveltejs/kit';
import { proxyHubRequest } from '$lib/server/hubProxy';
import {
	BootstrapValidationError,
	type BootstrapPayload,
	assertPostableBootstrapJournal,
	resolveBootstrapJournalSpec
} from '$lib/server/bootstrapJournal';
import type { RequestHandler } from './$types';

interface BootstrapResult {
	operation: string;
	entityType?: string;
	entityId?: string;
	data: unknown;
}
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const payload = await readPayload(request);
		const result = await runBootstrapOperation(params.operation, request.headers, payload);
		return json(result, { status: 201 });
	} catch (error) {
		if (error instanceof BootstrapValidationError) {
			return json({ error: error.message }, { status: error.status });
		}

		const message = error instanceof Error ? error.message : 'Bootstrap operation failed.';
		return json({ error: message }, { status: 500 });
	}
};

async function runBootstrapOperation(
	operation: string,
	headers: Headers,
	payload: BootstrapPayload
): Promise<BootstrapResult> {
	switch (operation) {
		case 'create-customer':
			return createCustomer(headers, payload);
		case 'create-quote':
			return createQuote(headers, payload);
			case 'create-payment':
				return createPayment(headers, payload);
		case 'create-supplier':
			return createSupplier(headers, payload);
		case 'create-requisition':
			return createRequisition(headers, payload);
		case 'create-purchase-order':
			return createPurchaseOrder(headers, payload);
			case 'create-goods-receipt':
				return createGoodsReceipt(headers, payload);
			case 'create-supplier-invoice':
				return createSupplierInvoice(headers, payload);
			case 'create-ap-payment':
				return createApPayment(headers, payload);
		case 'create-employee':
			return createEmployee(headers, payload);
			case 'create-position':
				return createPosition(headers, payload);
			case 'create-assignment':
				return createAssignment(headers, payload);
			case 'create-credential':
				return createCredential(headers, payload);
			case 'create-authority-rule':
				return createAuthorityRule(headers, payload);
			case 'create-legal-entity':
				return createLegalEntity(headers, payload);
			case 'create-ledger':
				return createLedger(headers, payload);
			case 'create-ledger-set':
				return createLedgerSet(headers, payload);
			case 'create-account':
				return createAccount(headers, payload);
			case 'create-fiscal-year':
				return createFiscalYear(headers, payload);
			case 'create-fiscal-period':
				return createFiscalPeriod(headers, payload);
			case 'create-segment-definition':
				return createSegmentDefinition(headers, payload);
			case 'create-fx-rate-type':
				return createFxRateType(headers, payload);
			case 'create-fx-rate':
				return createFxRate(headers, payload);
			case 'create-posting-profile':
				return createPostingProfile(headers, payload);
			case 'create-combination-rule':
				return createCombinationRule(headers, payload);
		case 'create-journal':
			return createJournal(headers, payload);
		default:
			throw new Error(`Unsupported bootstrap operation '${operation}'.`);
	}
}

async function createCustomer(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const stamp = Date.now();
	const customerName = asNonEmptyString(payload.customerName) ?? `Bootstrap Customer ${stamp}`;
	const email = asOptionalString(payload.email) ?? `bootstrap.customer.${stamp}@example.local`;
	const billingAddress = asOptionalString(payload.billingAddress) ?? '1 Constitutional Way';
	const shippingAddress = asOptionalString(payload.shippingAddress) ?? billingAddress;

	const customer = await asJson(
		await proxyHubRequest('/o2c/customers', headers, 'POST', {
			customerName,
			email,
			billingAddress,
			shippingAddress
		})
	);

	return {
		operation: 'create-customer',
		entityType: 'o2c_customer',
		entityId: String((customer as Record<string, unknown>).customer_id),
		data: customer
	};
}

async function createQuote(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const stamp = Date.now();
	let customerId = asNonEmptyString(payload.customerId);
	let createdCustomer: unknown = null;

	if (!customerId) {
		const customerResult = await createCustomer(headers, {
			customerName: asNonEmptyString(payload.customerName) ?? `Quote Customer ${stamp}`,
			email: asOptionalString(payload.customerEmail) ?? `quote.customer.${stamp}@example.local`,
			billingAddress: asOptionalString(payload.billingAddress) ?? '1 Constitutional Way',
			shippingAddress: asOptionalString(payload.shippingAddress) ?? '1 Constitutional Way'
		});
		customerId = customerResult.entityId;
		createdCustomer = customerResult.data;
	}

	if (!customerId) {
		throw new Error('Customer is required to create a quote.');
	}

	const currencyCode = asCurrency(payload.currencyCode) ?? 'USD';
	const legalEntityId = asNonEmptyString(payload.legalEntityId);
	if (!legalEntityId) {
		throw new Error('legalEntityId is required to create a quote.');
	}

	const quote = await asJson(
		await proxyHubRequest('/o2c/quotes', headers, 'POST', {
			customerId,
			currencyCode,
			legalEntityId
		})
	) as Record<string, unknown>;

	const quoteId = String(quote.quote_id ?? '');
	if (!quoteId) {
		throw new Error('Quote creation succeeded but quote_id was missing.');
	}

	const lineSku = asNonEmptyString(payload.lineSku);
	const lineQuantity = asPositiveNumber(payload.lineQuantity);
	const lineUnitPrice = asNonNegativeNumber(payload.lineUnitPrice);
	let line: unknown = null;

	if (lineSku && lineQuantity !== null && lineUnitPrice !== null) {
		line = await asJson(
			await proxyHubRequest(`/o2c/quotes/${quoteId}/lines`, headers, 'POST', {
				sku: lineSku,
				quantity: lineQuantity,
				unitPrice: lineUnitPrice
			})
		);
	}

	const refreshedQuote = await asJson(await proxyHubRequest(`/o2c/quotes/${quoteId}`, headers, 'GET'));

	return {
		operation: 'create-quote',
		entityType: 'o2c_quote',
		entityId: quoteId,
		data: { customer: createdCustomer, quote: refreshedQuote, line }
	};
}

async function createPayment(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const invoiceId = asNonEmptyString(payload.invoiceId);
	if (!invoiceId) {
		throw new Error('invoiceId is required to create a payment.');
	}

	const amount = asPositiveNumber(payload.amount);
	if (amount === null) {
		throw new Error('amount must be greater than zero to create a payment.');
	}

	const payment = await asJson(
		await proxyHubRequest('/o2c/payments', headers, 'POST', {
			invoiceId,
			amount,
			currencyCode: asCurrency(payload.currencyCode) ?? 'USD',
			method: asOptionalString(payload.method),
			paymentDate: asOptionalString(payload.paymentDate)
		})
	);

	return {
		operation: 'create-payment',
		entityType: 'o2c_payment',
		entityId: String((payment as Record<string, unknown>).payment_id),
		data: payment
	};
}

async function createSupplier(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const stamp = Date.now();
	const supplierName = asNonEmptyString(payload.supplierName) ?? `Bootstrap Supplier ${stamp}`;
	const email = asOptionalString(payload.email) ?? `bootstrap.supplier.${stamp}@example.local`;
	const paymentTerms = asOptionalString(payload.paymentTerms) ?? 'NET30';
	const currencyCode = asCurrency(payload.currencyCode) ?? 'USD';
	const taxId = asOptionalString(payload.taxId);

	const supplier = await asJson(
		await proxyHubRequest('/p2p/suppliers', headers, 'POST', {
			supplierName,
			email,
			paymentTerms,
			taxId,
			currencyCode
		})
	);

	return {
		operation: 'create-supplier',
		entityType: 'p2p_supplier',
		entityId: String((supplier as Record<string, unknown>).supplier_id),
		data: supplier
	};
}

async function createRequisition(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const requester = asNonEmptyString(payload.requester) ?? 'principal.system';
	const department = asOptionalString(payload.department) ?? 'Operations';
	const legalEntityId = asOptionalString(payload.legalEntityId);
	const currencyCode = asCurrency(payload.currencyCode) ?? 'USD';
	const neededByDate = asOptionalString(payload.neededByDate);

	const requisition = await asJson(
		await proxyHubRequest('/p2p/requisitions', headers, 'POST', {
			requester,
			department,
			legalEntityId,
			currencyCode,
			neededByDate
		})
	);

	return {
		operation: 'create-requisition',
		entityType: 'p2p_requisition',
		entityId: String((requisition as Record<string, unknown>).requisition_id),
		data: requisition
	};
}

async function createPurchaseOrder(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const supplierId = asNonEmptyString(payload.supplierId);
	if (!supplierId) {
		throw new Error('supplierId is required to create a purchase order.');
	}

	const po = await asJson(
		await proxyHubRequest('/p2p/purchase-orders', headers, 'POST', {
			supplierId,
			requisitionId: asOptionalString(payload.requisitionId),
			totalAmount: asNonNegativeNumber(payload.totalAmount),
			currencyCode: asCurrency(payload.currencyCode),
			deliveryAddress: asOptionalString(payload.deliveryAddress)
		})
	);

	return {
		operation: 'create-purchase-order',
		entityType: 'p2p_purchase_order',
		entityId: String((po as Record<string, unknown>).po_id),
		data: po
	};
}

async function createGoodsReceipt(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const poId = asNonEmptyString(payload.poId);
	if (!poId) {
		throw new Error('poId is required to create a goods receipt.');
	}

	const receipt = await asJson(await proxyHubRequest('/p2p/goods-receipts', headers, 'POST', { poId }));

	return {
		operation: 'create-goods-receipt',
		entityType: 'p2p_goods_receipt',
		entityId: String((receipt as Record<string, unknown>).receipt_id),
		data: receipt
	};
}

async function createSupplierInvoice(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const receiptId = asNonEmptyString(payload.receiptId);
	if (!receiptId) {
		throw new Error('receiptId is required to create a supplier invoice.');
	}

	const invoice = await asJson(
		await proxyHubRequest('/p2p/supplier-invoices', headers, 'POST', {
			receiptId,
			invoiceDate: asOptionalString(payload.invoiceDate),
			dueDate: asOptionalString(payload.dueDate),
			currencyCode: asCurrency(payload.currencyCode)
		})
	);

	return {
		operation: 'create-supplier-invoice',
		entityType: 'p2p_supplier_invoice',
		entityId: String((invoice as Record<string, unknown>).supplier_invoice_id),
		data: invoice
	};
}

async function createApPayment(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const supplierInvoiceId = asNonEmptyString(payload.supplierInvoiceId);
	if (!supplierInvoiceId) {
		throw new Error('supplierInvoiceId is required to create an AP payment.');
	}

	const amount = asPositiveNumber(payload.amount);
	if (amount === null) {
		throw new Error('amount must be greater than zero to create an AP payment.');
	}

	const payment = await asJson(
		await proxyHubRequest('/p2p/ap-payments', headers, 'POST', {
			supplierInvoiceId,
			amount,
			currencyCode: asCurrency(payload.currencyCode) ?? 'USD',
			method: asOptionalString(payload.method)
		})
	);

	return {
		operation: 'create-ap-payment',
		entityType: 'p2p_ap_payment',
		entityId: String((payment as Record<string, unknown>).ap_payment_id),
		data: payment
	};
}

async function createEmployee(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const stamp = Date.now();
	const name = asNonEmptyString(payload.name) ?? `Bootstrap Employee ${stamp}`;
	const email = asOptionalString(payload.email) ?? `bootstrap.employee.${stamp}@example.local`;
	const autoActivate = asBoolean(payload.autoActivate, true);

	let employee = (await asJson(
		await proxyHubRequest('/h2r/employees', headers, 'POST', {
			name,
			email
		})
	)) as Record<string, unknown>;

	const activateLink = (employee._links as Record<string, { href?: string; method?: string }> | undefined)?.activate;
	if (autoActivate && activateLink?.href) {
		employee = (await asJson(await proxyHubRequest(toApiPath(activateLink.href), headers, 'POST', {}))) as Record<string, unknown>;
	}

	return {
		operation: 'create-employee',
		entityType: 'h2r_employee',
		entityId: String(employee.employee_id),
		data: employee
	};
}

async function createPosition(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const stamp = Date.now();
	const position = await asJson(
		await proxyHubRequest('/h2r/positions', headers, 'POST', {
			title: asNonEmptyString(payload.title) ?? `Position ${stamp}`,
			department: asNonEmptyString(payload.department) ?? 'Operations',
			authorityDomain: asAuthorityDomain(payload.authorityDomain) ?? 'R2R',
			authorityTier: asTier(payload.authorityTier) ?? 2
		})
	);

	return {
		operation: 'create-position',
		entityType: 'h2r_position',
		entityId: String((position as Record<string, unknown>).position_id),
		data: position
	};
}

async function createAssignment(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const employeeId = asNonEmptyString(payload.employeeId);
	const positionId = asNonEmptyString(payload.positionId);
	if (!employeeId || !positionId) {
		throw new Error('employeeId and positionId are required to create an assignment.');
	}

	const assignment = await asJson(
		await proxyHubRequest('/h2r/assignments', headers, 'POST', {
			employeeId,
			positionId,
			startDate: asOptionalString(payload.startDate),
			endDate: asOptionalString(payload.endDate),
			department: asOptionalString(payload.department),
			role: asOptionalString(payload.role)
		})
	);

	return {
		operation: 'create-assignment',
		entityType: 'h2r_assignment',
		entityId: String((assignment as Record<string, unknown>).assignment_id),
		data: assignment
	};
}

async function createCredential(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const employeeId = asNonEmptyString(payload.employeeId);
	if (!employeeId) {
		throw new Error('employeeId is required to create a credential.');
	}

	const credential = await asJson(
		await proxyHubRequest('/h2r/credentials', headers, 'POST', {
			employeeId,
			type: asNonEmptyString(payload.type) ?? 'GeneralAccess',
			expiryDate: asOptionalString(payload.expiryDate)
		})
	);

	return {
		operation: 'create-credential',
		entityType: 'h2r_credential',
		entityId: String((credential as Record<string, unknown>).credential_id),
		data: credential
	};
}

async function createAuthorityRule(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const threshold = asPositiveNumber(payload.threshold);
	if (threshold === null) {
		throw new Error('threshold must be greater than zero to create an authority rule.');
	}

	const rule = await asJson(
		await proxyHubRequest('/h2r/authority-rules', headers, 'POST', {
			domain: asAuthorityDomain(payload.domain) ?? 'R2R',
			threshold,
			requiredTier: asTier(payload.requiredTier) ?? 2
		})
	);

	return {
		operation: 'create-authority-rule',
		entityType: 'h2r_authority_rule',
		entityId: String((rule as Record<string, unknown>).rule_id),
		data: rule
	};
}

async function createLegalEntity(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const stamp = Date.now();
	const legalEntity = await asJson(
		await proxyHubRequest('/r2r/legal-entities', headers, 'POST', {
			name: asNonEmptyString(payload.name) ?? `Legal Entity ${stamp}`,
			currencyCode: asCurrency(payload.currencyCode) ?? 'USD',
			parentLegalEntityId: asOptionalString(payload.parentLegalEntityId)
		})
	);

	return {
		operation: 'create-legal-entity',
		entityType: 'r2r_legal_entity',
		entityId: String((legalEntity as Record<string, unknown>).legal_entity_id),
		data: legalEntity
	};
}

async function createLedger(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const stamp = Date.now();
	const ledger = await asJson(
		await proxyHubRequest('/r2r/ledgers', headers, 'POST', {
			name: asNonEmptyString(payload.name) ?? `Ledger ${stamp}`,
			currencyCode: asCurrency(payload.currencyCode) ?? 'USD',
			calendar: asOptionalString(payload.calendar),
			chartOfAccountsRef: asOptionalString(payload.chartOfAccountsRef),
			legalEntityId: asOptionalString(payload.legalEntityId)
		})
	);

	return {
		operation: 'create-ledger',
		entityType: 'r2r_ledger',
		entityId: String((ledger as Record<string, unknown>).ledger_id),
		data: ledger
	};
}

async function createLedgerSet(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const stamp = Date.now();
	const ledgerSet = await asJson(
		await proxyHubRequest('/r2r/ledger-sets', headers, 'POST', {
			name: asNonEmptyString(payload.name) ?? `Ledger Set ${stamp}`,
			description: asOptionalString(payload.description)
		})
	);

	return {
		operation: 'create-ledger-set',
		entityType: 'r2r_ledger_set',
		entityId: String((ledgerSet as Record<string, unknown>).ledger_set_id),
		data: ledgerSet
	};
}

async function createAccount(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const stamp = Date.now();
	const account = await asJson(
		await proxyHubRequest('/r2r/accounts', headers, 'POST', {
			accountCode: asNonEmptyString(payload.accountCode) ?? `ACC-${stamp}`,
			accountName: asNonEmptyString(payload.accountName) ?? `Account ${stamp}`,
			accountType: asAccountType(payload.accountType) ?? 'Asset',
			parentAccountId: asOptionalString(payload.parentAccountId)
		})
	);

	return {
		operation: 'create-account',
		entityType: 'r2r_account',
		entityId: String((account as Record<string, unknown>).account_id),
		data: account
	};
}

async function createFiscalYear(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const nowYear = new Date().getUTCFullYear();
	const yearLabel = asNonEmptyString(payload.yearLabel) ?? `FY${nowYear}`;
	const startDate = asNonEmptyString(payload.startDate) ?? `${nowYear}-01-01`;
	const endDate = asNonEmptyString(payload.endDate) ?? `${nowYear}-12-31`;

	const fiscalYear = await asJson(
		await proxyHubRequest('/r2r/fiscal-years', headers, 'POST', {
			yearLabel,
			startDate,
			endDate
		})
	);

	return {
		operation: 'create-fiscal-year',
		entityType: 'r2r_fiscal_year',
		entityId: String((fiscalYear as Record<string, unknown>).fiscal_year_id),
		data: fiscalYear
	};
}

async function createFiscalPeriod(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	let fiscalYearId = asNonEmptyString(payload.fiscalYearId);
	if (!fiscalYearId) {
		const years = (await asJson(await proxyHubRequest('/r2r/fiscal-years', headers, 'GET'))) as {
			data?: Array<Record<string, unknown>>;
		};
		fiscalYearId = asNonEmptyString(years.data?.[0]?.fiscal_year_id);
	}

	if (!fiscalYearId) {
		throw new Error('fiscalYearId is required to create a fiscal period.');
	}

	const periodNumber = asInteger(payload.periodNumber) ?? 1;
	const defaultMonth = String(Math.min(Math.max(periodNumber, 1), 12)).padStart(2, '0');
	const nowYear = new Date().getUTCFullYear();
	const startDate = asNonEmptyString(payload.startDate) ?? `${nowYear}-${defaultMonth}-01`;
	const endDate = asNonEmptyString(payload.endDate) ?? `${nowYear}-${defaultMonth}-28`;

	const fiscalPeriod = await asJson(
		await proxyHubRequest('/r2r/fiscal-periods', headers, 'POST', {
			fiscalYearId,
			periodNumber,
			startDate,
			endDate
		})
	);

	return {
		operation: 'create-fiscal-period',
		entityType: 'r2r_fiscal_period',
		entityId: String((fiscalPeriod as Record<string, unknown>).fiscal_period_id),
		data: fiscalPeriod
	};
}

async function createSegmentDefinition(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const stamp = Date.now();
	const segment = await asJson(
		await proxyHubRequest('/r2r/accounts/segment-definitions', headers, 'POST', {
			code: asNonEmptyString(payload.code) ?? `SEG_${stamp}`,
			name: asNonEmptyString(payload.name) ?? `Segment ${stamp}`,
			sortOrder: asInteger(payload.sortOrder) ?? 1,
			isRequired: asBoolean(payload.isRequired, true)
		})
	);

	return {
		operation: 'create-segment-definition',
		entityType: 'r2r_coa_segment_definition',
		entityId: String((segment as Record<string, unknown>).segment_definition_id),
		data: segment
	};
}

async function createFxRateType(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const stamp = Date.now();
	const rateType = await asJson(
		await proxyHubRequest('/r2r/fx/rate-types', headers, 'POST', {
			code: asNonEmptyString(payload.code) ?? `FXT${stamp}`,
			name: asNonEmptyString(payload.name) ?? `Rate Type ${stamp}`,
			description: asOptionalString(payload.description)
		})
	);

	return {
		operation: 'create-fx-rate-type',
		entityType: 'r2r_fx_rate_type',
		entityId: String((rateType as Record<string, unknown>).rate_type_id),
		data: rateType
	};
}

async function createFxRate(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	let rateTypeId = asNonEmptyString(payload.rateTypeId);
	if (!rateTypeId) {
		const rateTypes = (await asJson(await proxyHubRequest('/r2r/fx/rate-types', headers, 'GET'))) as {
			data?: Array<Record<string, unknown>>;
		};
		rateTypeId = asNonEmptyString(rateTypes.data?.[0]?.rate_type_id);
	}

	if (!rateTypeId) {
		throw new Error('rateTypeId is required to create an FX rate.');
	}

	const rate = asPositiveNumber(payload.rate);
	if (rate === null) {
		throw new Error('rate must be greater than zero to create an FX rate.');
	}

	const fxRate = await asJson(
		await proxyHubRequest('/r2r/fx/rates', headers, 'POST', {
			rateTypeId,
			fromCurrency: asCurrency(payload.fromCurrency) ?? 'USD',
			toCurrency: asCurrency(payload.toCurrency) ?? 'USD',
			rate,
			validFrom: asNonEmptyString(payload.validFrom) ?? new Date().toISOString()
		})
	);

	return {
		operation: 'create-fx-rate',
		entityType: 'r2r_fx_rate',
		entityId: String((fxRate as Record<string, unknown>).rate_id),
		data: fxRate
	};
}

async function createPostingProfile(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const lines = asPostingLines(payload.lines);

	if (lines.length === 0) {
		const debitAccountId = asNonEmptyString(payload.debitAccountId);
		const creditAccountId = asNonEmptyString(payload.creditAccountId);
		const amountSource = asNonEmptyString(payload.amountSource) ?? 'grossAmount';

		if (!debitAccountId || !creditAccountId) {
			throw new Error('lines or both debitAccountId and creditAccountId are required to create a posting profile.');
		}

		lines.push(
			{ entrySide: 'debit', accountId: debitAccountId, amountSource },
			{ entrySide: 'credit', accountId: creditAccountId, amountSource }
		);
	}

	const stamp = Date.now();
	const postingProfile = await asJson(
		await proxyHubRequest('/r2r/sla/posting-profiles', headers, 'POST', {
			name: asNonEmptyString(payload.name) ?? `Posting Profile ${stamp}`,
			eventType: asNonEmptyString(payload.eventType) ?? 'o2c.invoice.posted',
			lines
		})
	);

	return {
		operation: 'create-posting-profile',
		entityType: 'r2r_sla_posting_profile',
		entityId: String((postingProfile as Record<string, unknown>).posting_profile_id),
		data: postingProfile
	};
}

async function createCombinationRule(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const conditions = asCombinationConditions(payload.conditions);
	if (conditions.length === 0) {
		const segmentDefinitionId = asNonEmptyString(payload.segmentDefinitionId);
		const expectedValue = asNonEmptyString(payload.expectedValue);
		if (!segmentDefinitionId || !expectedValue) {
			throw new Error('conditions or both segmentDefinitionId and expectedValue are required to create a combination rule.');
		}
		conditions.push({ segmentDefinitionId, expectedValue });
	}

	const stamp = Date.now();
	const combinationRule = await asJson(
		await proxyHubRequest('/r2r/accounts/combination-rules', headers, 'POST', {
			name: asNonEmptyString(payload.name) ?? `Combination Rule ${stamp}`,
			description: asOptionalString(payload.description),
			conditions
		})
	);

	return {
		operation: 'create-combination-rule',
		entityType: 'r2r_coa_combination_rule',
		entityId: String((combinationRule as Record<string, unknown>).rule_id),
		data: combinationRule
	};
}

async function createJournal(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const journalSpec = resolveBootstrapJournalSpec(payload);
	const selectedLedgerId = asOptionalString(payload.ledgerId);

	const periods = (await asJson(await proxyHubRequest('/r2r/fiscal-periods', headers, 'GET'))) as {
		data?: Array<Record<string, unknown>>;
	};

	const firstPeriod = periods.data?.[0];
	const fiscalPeriodId = asNonEmptyString(payload.fiscalPeriodId) ?? String(firstPeriod?.fiscal_period_id ?? '');
	if (!fiscalPeriodId) {
		throw new Error('No fiscal period available to create a journal.');
	}

	if (selectedLedgerId) {
		const debitAccount = (await asJson(
			await proxyHubRequest(`/query/r2r_account/${encodeURIComponent(journalSpec.debitAccountId)}`, headers, 'GET')
		)) as { data?: Record<string, unknown> };
		const creditAccount = (await asJson(
			await proxyHubRequest(`/query/r2r_account/${encodeURIComponent(journalSpec.creditAccountId)}`, headers, 'GET')
		)) as { data?: Record<string, unknown> };

		const debitLedgerId = asOptionalString(debitAccount.data?.ledger_id);
		const creditLedgerId = asOptionalString(creditAccount.data?.ledger_id);

		if (debitLedgerId !== selectedLedgerId) {
			throw new Error('Selected debit account does not belong to the selected ledger.');
		}

		if (creditLedgerId !== selectedLedgerId) {
			throw new Error('Selected credit account does not belong to the selected ledger.');
		}
	}

	const description = asOptionalString(payload.description) ?? 'Bootstrap Draft Journal';

	const journal = await asJson(
		await proxyHubRequest('/r2r/journals', headers, 'POST', {
			fiscalPeriodId,
			ledgerId: selectedLedgerId,
			description
		})
	) as Record<string, unknown>;

	const journalId = String(journal.journal_id ?? '');
	if (!journalId) {
		throw new Error('Journal creation succeeded but journal_id was missing.');
	}

	const lines: unknown[] = [];
	let linesCreated = 0;

	try {
		const debitLine = await asJson(
			await proxyHubRequest(`/r2r/journals/${journalId}/lines`, headers, 'POST', {
				accountId: journalSpec.debitAccountId,
				debitAmount: journalSpec.amount,
				creditAmount: 0,
				memo: journalSpec.memo
			})
		);
		lines.push(debitLine);
		linesCreated += 1;

		const creditLine = await asJson(
			await proxyHubRequest(`/r2r/journals/${journalId}/lines`, headers, 'POST', {
				accountId: journalSpec.creditAccountId,
				debitAmount: 0,
				creditAmount: journalSpec.amount,
				memo: journalSpec.memo
			})
		);
		lines.push(creditLine);
		linesCreated += 1;

		assertPostableBootstrapJournal(linesCreated, journalSpec);
	} catch (error) {
		if (linesCreated > 0) {
			try {
				await proxyHubRequest(`/r2r/journals/${journalId}/cancel`, headers, 'POST', {});
			} catch {
				// Best-effort cleanup only; preserve original failure below.
			}
		}

		throw error;
	}

	const refreshedJournal = await asJson(await proxyHubRequest(`/r2r/journals/${journalId}`, headers, 'GET'));

	return {
		operation: 'create-journal',
		entityType: 'r2r_journal',
		entityId: journalId,
		data: { journal: refreshedJournal, lines }
	};
}

async function readPayload(request: Request): Promise<BootstrapPayload> {
	try {
		const body = await request.json();
		if (body && typeof body === 'object' && !Array.isArray(body)) {
			return body as BootstrapPayload;
		}
		return {};
	} catch {
		return {};
	}
}

function asOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
	return asOptionalString(value);
}

function asCurrency(value: unknown): string | undefined {
	const candidate = asOptionalString(value);
	if (!candidate) {
		return undefined;
	}
	const normalized = candidate.toUpperCase();
	return normalized.length === 3 ? normalized : undefined;
}

function asNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function asPositiveNumber(value: unknown): number | null {
	const numeric = asNumber(value);
	if (numeric === null || numeric <= 0) {
		return null;
	}
	return numeric;
}

function asNonNegativeNumber(value: unknown): number | null {
	const numeric = asNumber(value);
	if (numeric === null || numeric < 0) {
		return null;
	}
	return numeric;
}

function asInteger(value: unknown): number | null {
	const numeric = asNumber(value);
	if (numeric === null || !Number.isInteger(numeric)) {
		return null;
	}
	return numeric;
}

function asTier(value: unknown): number | null {
	const integer = asInteger(value);
	if (integer === null || integer < 1 || integer > 5) {
		return null;
	}
	return integer;
}

function asAuthorityDomain(value: unknown): 'O2C' | 'P2P' | 'R2R' | 'H2R' | null {
	const candidate = asOptionalString(value)?.toUpperCase();
	if (!candidate) {
		return null;
	}
	if (candidate === 'O2C' || candidate === 'P2P' || candidate === 'R2R' || candidate === 'H2R') {
		return candidate;
	}
	return null;
}

function asAccountType(value: unknown): 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' | null {
	const candidate = asOptionalString(value);
	if (!candidate) {
		return null;
	}

	const byNormalized: Record<string, 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'> = {
		asset: 'Asset',
		liability: 'Liability',
		equity: 'Equity',
		revenue: 'Revenue',
		expense: 'Expense'
	};

	return byNormalized[candidate.toLowerCase()] ?? null;
}

type PostingLine = {
	entrySide: 'debit' | 'credit';
	accountId: string;
	amountSource: string;
};

function asPostingLines(value: unknown): PostingLine[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const lines: PostingLine[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}

		const record = entry as Record<string, unknown>;
		const entrySide = asOptionalString(record.entrySide)?.toLowerCase();
		const accountId = asNonEmptyString(record.accountId);
		const amountSource = asNonEmptyString(record.amountSource);
		if (!accountId || !amountSource || (entrySide !== 'debit' && entrySide !== 'credit')) {
			continue;
		}

		lines.push({ entrySide, accountId, amountSource });
	}

	return lines;
}

type CombinationCondition = {
	segmentDefinitionId: string;
	expectedValue: string;
};

function asCombinationConditions(value: unknown): CombinationCondition[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const conditions: CombinationCondition[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}

		const record = entry as Record<string, unknown>;
		const segmentDefinitionId = asNonEmptyString(record.segmentDefinitionId);
		const expectedValue = asNonEmptyString(record.expectedValue);
		if (!segmentDefinitionId || !expectedValue) {
			continue;
		}

		conditions.push({ segmentDefinitionId, expectedValue });
	}

	return conditions;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'true') {
			return true;
		}
		if (normalized === 'false') {
			return false;
		}
	}
	return fallback;
}

async function asJson(response: Response): Promise<unknown> {
	const contentType = response.headers.get('content-type') ?? '';
	if (!response.ok) {
		const text = await response.text();
		throw new Error(text || `Hub call failed with status ${response.status}`);
	}

	if (contentType.includes('application/json')) {
		return response.json();
	}

	throw new Error('Expected JSON response from Integration Hub.');
}

function toApiPath(href: string): string {
	const prefix = '/api/v1';
	return href.startsWith(prefix) ? href.slice(prefix.length) || '/' : href;
}
