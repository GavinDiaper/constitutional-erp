const CANONICAL_ROUTE_BY_ENTITY_TYPE: Record<string, string> = {
	o2c_quote: '/process/quote/{entityId}',
	o2c_sales_order: '/process/sales-order/{entityId}',
	o2c_invoice: '/process/ar-invoice/{entityId}',
	o2c_payment: '/process/ar-payment/{entityId}',
	p2p_purchase_order: '/process/purchase-order/{entityId}',
	p2p_requisition: '/process/requisition/{entityId}',
	p2p_goods_receipt: '/process/goods-receipt/{entityId}',
	p2p_supplier_invoice: '/process/supplier-invoice/{entityId}',
	p2p_ap_payment: '/process/ap-payment/{entityId}',
	p2p_supplier: '/process/supplier/{entityId}',
	r2r_account: '/process/account/{entityId}',
	r2r_fiscal_year: '/process/fiscal-year/{entityId}',
	r2r_fiscal_period: '/process/fiscal-period/{entityId}',
	r2r_journal: '/process/journal/{entityId}',
	r2r_tax_regime: '/process/tax-regime/{entityId}',
	r2r_tax_jurisdiction: '/process/tax-jurisdiction/{entityId}',
	r2r_tax_code: '/process/tax-code/{entityId}',
	r2r_tax_rate: '/process/tax-rate/{entityId}',
	r2r_tax_rule: '/process/tax-rule/{entityId}',
	r2r_tax_account_mapping: '/process/tax-account-mapping/{entityId}',
	r2r_tax_transaction_line: '/process/tax-transaction-line/{entityId}',
	h2r_employee: '/process/employee/{entityId}',
	h2r_position: '/process/position/{entityId}',
	h2r_assignment: '/process/assignment/{entityId}',
	h2r_credential: '/process/credential/{entityId}',
	h2r_authority_rule: '/process/authority-rule/{entityId}',
	o2c_customer: '/o2c/customers/{entityId}'
};

const ENTITY_TYPE_ALIASES: Record<string, string> = {
	o2c_arinvoice: 'o2c_invoice',
	o2c_ar_invoice: 'o2c_invoice',
	o2c_arpayment: 'o2c_payment',
	o2c_ar_payment: 'o2c_payment',
	p2p_appayment: 'p2p_ap_payment'
};

export function normalizeProcessEntityType(entityType: string): string {
	const normalized = entityType.trim().toLowerCase();
	return ENTITY_TYPE_ALIASES[normalized] ?? normalized;
}

export function mapEntityTypeToRoute(entityType: string, entityId: string): string {
	const normalizedEntityType = normalizeProcessEntityType(entityType);
	const template = CANONICAL_ROUTE_BY_ENTITY_TYPE[normalizedEntityType];
	if (template) {
		return template.replace('{entityId}', entityId);
	}

	return `/process/${normalizedEntityType}/${entityId}`;
}