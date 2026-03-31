import { json } from '@sveltejs/kit';
import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

interface BootstrapResult {
	operation: string;
	entityType?: string;
	entityId?: string;
	data: unknown;
}

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const result = await runBootstrapOperation(params.operation, request.headers);
		return json(result, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Bootstrap operation failed.';
		return json({ error: message }, { status: 500 });
	}
};

async function runBootstrapOperation(operation: string, headers: Headers): Promise<BootstrapResult> {
	switch (operation) {
		case 'create-customer':
			return createCustomer(headers);
		case 'create-quote':
			return createQuote(headers);
		case 'create-supplier':
			return createSupplier(headers);
		case 'create-requisition':
			return createRequisition(headers);
		case 'create-employee':
			return createEmployee(headers);
		case 'create-journal':
			return createJournal(headers);
		default:
			throw new Error(`Unsupported bootstrap operation '${operation}'.`);
	}
}

async function createCustomer(headers: Headers): Promise<BootstrapResult> {
	const stamp = Date.now();
	const customer = await asJson(
		await proxyHubRequest('/o2c/customers', headers, 'POST', {
			customerName: `Bootstrap Customer ${stamp}`,
			email: `bootstrap.customer.${stamp}@example.local`,
			billingAddress: '1 Constitutional Way',
			shippingAddress: '1 Constitutional Way'
		})
	);

	return {
		operation: 'create-customer',
		entityType: 'o2c_customer',
		entityId: String((customer as Record<string, unknown>).customer_id),
		data: customer
	};
}

async function createQuote(headers: Headers): Promise<BootstrapResult> {
	const customerResult = await createCustomer(headers);
	const customerId = customerResult.entityId as string;

	const quote = await asJson(
		await proxyHubRequest('/o2c/quotes', headers, 'POST', {
			customerId,
			currencyCode: 'USD'
		})
	);

	return {
		operation: 'create-quote',
		entityType: 'o2c_quote',
		entityId: String((quote as Record<string, unknown>).quote_id),
		data: { customer: customerResult.data, quote }
	};
}

async function createSupplier(headers: Headers): Promise<BootstrapResult> {
	const stamp = Date.now();
	const supplier = await asJson(
		await proxyHubRequest('/p2p/suppliers', headers, 'POST', {
			supplierName: `Bootstrap Supplier ${stamp}`,
			email: `bootstrap.supplier.${stamp}@example.local`,
			paymentTerms: 'NET30',
			currencyCode: 'USD'
		})
	);

	return {
		operation: 'create-supplier',
		entityType: 'p2p_supplier',
		entityId: String((supplier as Record<string, unknown>).supplier_id),
		data: supplier
	};
}

async function createRequisition(headers: Headers): Promise<BootstrapResult> {
	const requisition = await asJson(
		await proxyHubRequest('/p2p/requisitions', headers, 'POST', {
			requester: 'principal.system',
			department: 'Operations',
			currencyCode: 'USD'
		})
	);

	return {
		operation: 'create-requisition',
		entityType: 'p2p_requisition',
		entityId: String((requisition as Record<string, unknown>).requisition_id),
		data: requisition
	};
}

async function createEmployee(headers: Headers): Promise<BootstrapResult> {
	const stamp = Date.now();
	let employee = (await asJson(
		await proxyHubRequest('/h2r/employees', headers, 'POST', {
			name: `Bootstrap Employee ${stamp}`,
			email: `bootstrap.employee.${stamp}@example.local`
		})
	)) as Record<string, unknown>;

	const activateLink = (employee._links as Record<string, { href?: string; method?: string }> | undefined)?.activate;
	if (activateLink?.href) {
		employee = (await asJson(await proxyHubRequest(toApiPath(activateLink.href), headers, 'POST', {}))) as Record<string, unknown>;
	}

	return {
		operation: 'create-employee',
		entityType: 'h2r_employee',
		entityId: String(employee.employee_id),
		data: employee
	};
}

async function createJournal(headers: Headers): Promise<BootstrapResult> {
	const periods = (await asJson(await proxyHubRequest('/r2r/fiscal-periods', headers, 'GET'))) as {
		data?: Array<Record<string, unknown>>;
	};

	const firstPeriod = periods.data?.[0];
	const fiscalPeriodId = String(firstPeriod?.fiscal_period_id ?? '');
	if (!fiscalPeriodId) {
		throw new Error('No fiscal period available to create a journal.');
	}

	const journal = await asJson(
		await proxyHubRequest('/r2r/journals', headers, 'POST', {
			fiscalPeriodId,
			description: 'Bootstrap Draft Journal'
		})
	);

	return {
		operation: 'create-journal',
		entityType: 'r2r_journal',
		entityId: String((journal as Record<string, unknown>).journal_id),
		data: journal
	};
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
