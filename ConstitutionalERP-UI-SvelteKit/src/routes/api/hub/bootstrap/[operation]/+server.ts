import { json } from '@sveltejs/kit';
import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

interface BootstrapResult {
	operation: string;
	entityType?: string;
	entityId?: string;
	data: unknown;
}

type BootstrapPayload = Record<string, unknown>;

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const payload = await readPayload(request);
		const result = await runBootstrapOperation(params.operation, request.headers, payload);
		return json(result, { status: 201 });
	} catch (error) {
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
		case 'create-supplier':
			return createSupplier(headers, payload);
		case 'create-requisition':
			return createRequisition(headers, payload);
		case 'create-purchase-order':
			return createPurchaseOrder(headers, payload);
		case 'create-employee':
			return createEmployee(headers, payload);
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

	const quote = await asJson(
		await proxyHubRequest('/o2c/quotes', headers, 'POST', {
			customerId,
			currencyCode
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
	const currencyCode = asCurrency(payload.currencyCode) ?? 'USD';
	const neededByDate = asOptionalString(payload.neededByDate);

	const requisition = await asJson(
		await proxyHubRequest('/p2p/requisitions', headers, 'POST', {
			requester,
			department,
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

async function createJournal(headers: Headers, payload: BootstrapPayload): Promise<BootstrapResult> {
	const periods = (await asJson(await proxyHubRequest('/r2r/fiscal-periods', headers, 'GET'))) as {
		data?: Array<Record<string, unknown>>;
	};

	const firstPeriod = periods.data?.[0];
	const fiscalPeriodId = asNonEmptyString(payload.fiscalPeriodId) ?? String(firstPeriod?.fiscal_period_id ?? '');
	if (!fiscalPeriodId) {
		throw new Error('No fiscal period available to create a journal.');
	}

	const description = asOptionalString(payload.description) ?? 'Bootstrap Draft Journal';

	const journal = await asJson(
		await proxyHubRequest('/r2r/journals', headers, 'POST', {
			fiscalPeriodId,
			description
		})
	) as Record<string, unknown>;

	const journalId = String(journal.journal_id ?? '');
	if (!journalId) {
		throw new Error('Journal creation succeeded but journal_id was missing.');
	}

	const lines: unknown[] = [];
	const memo = asOptionalString(payload.memo);

	const debitAccountId = asNonEmptyString(payload.debitAccountId);
	const creditAccountId = asNonEmptyString(payload.creditAccountId);
	const amount = asNonNegativeNumber(payload.amount);

	if (debitAccountId && creditAccountId && amount !== null && amount > 0) {
		const debitLine = await asJson(
			await proxyHubRequest(`/r2r/journals/${journalId}/lines`, headers, 'POST', {
				accountId: debitAccountId,
				debitAmount: amount,
				creditAmount: 0,
				memo
			})
		);
		lines.push(debitLine);

		const creditLine = await asJson(
			await proxyHubRequest(`/r2r/journals/${journalId}/lines`, headers, 'POST', {
				accountId: creditAccountId,
				debitAmount: 0,
				creditAmount: amount,
				memo
			})
		);
		lines.push(creditLine);
	} else {
		const accountId = asNonEmptyString(payload.accountId);
		const debitAmount = asNonNegativeNumber(payload.debitAmount);
		const creditAmount = asNonNegativeNumber(payload.creditAmount);

		if (accountId && debitAmount !== null && creditAmount !== null && (debitAmount > 0 || creditAmount > 0)) {
			const legacyLine = await asJson(
				await proxyHubRequest(`/r2r/journals/${journalId}/lines`, headers, 'POST', {
					accountId,
					debitAmount,
					creditAmount,
					memo
				})
			);
			lines.push(legacyLine);
		}
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
