const CANVAS_ENTITY_TYPE_BY_DOMAIN_ENTITY: Record<string, string> = {
	'o2c|Customer': 'o2c_customer',
	'o2c|Quote': 'o2c_quote',
	'o2c|SalesOrder': 'o2c_sales_order',
	'o2c|Order': 'o2c_sales_order',
	'o2c|ArInvoice': 'o2c_invoice',
	'o2c|ARInvoice': 'o2c_invoice',
	'o2c|ArPayment': 'o2c_payment',
	'o2c|ARPayment': 'o2c_payment',
	'p2p|Requisition': 'p2p_requisition',
	'p2p|Supplier': 'p2p_supplier',
	'p2p|PurchaseOrder': 'p2p_purchase_order',
	'p2p|GoodsReceipt': 'p2p_goods_receipt',
	'p2p|SupplierInvoice': 'p2p_supplier_invoice',
	'p2p|ApPayment': 'p2p_ap_payment',
	'p2p|APPayment': 'p2p_ap_payment',
	'r2r|Account': 'r2r_account',
	'r2r|FiscalYear': 'r2r_fiscal_year',
	'r2r|FiscalPeriod': 'r2r_fiscal_period',
	'r2r|Journal': 'r2r_journal',
	'r2r|TaxRegime': 'r2r_tax_regime',
	'r2r|TaxJurisdiction': 'r2r_tax_jurisdiction',
	'r2r|TaxCode': 'r2r_tax_code',
	'r2r|TaxRate': 'r2r_tax_rate',
	'r2r|TaxRule': 'r2r_tax_rule',
	'r2r|TaxAccountMapping': 'r2r_tax_account_mapping',
	'r2r|TaxTransactionLine': 'r2r_tax_transaction_line',
	'h2r|Employee': 'h2r_employee',
	'h2r|Position': 'h2r_position',
	'h2r|Assignment': 'h2r_assignment',
	'h2r|Credential': 'h2r_credential',
	'h2r|AuthorityRule': 'h2r_authority_rule'
};

function fallbackCanvasEntityType(domain: string, entity: string): string {
	const normalizedEntity = entity
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/[^a-zA-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.toLowerCase();

	return `${domain.trim().toLowerCase()}_${normalizedEntity}`;
}

export function toCanvasEntityType(domain: string, entity: string): string {
	const key = `${domain.trim().toLowerCase()}|${entity.trim()}`;
	return CANVAS_ENTITY_TYPE_BY_DOMAIN_ENTITY[key] ?? fallbackCanvasEntityType(domain, entity);
}

export default toCanvasEntityType;