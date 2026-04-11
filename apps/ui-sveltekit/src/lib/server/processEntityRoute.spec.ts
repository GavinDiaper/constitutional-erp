import { describe, expect, it } from 'vitest';

import { mapEntityTypeToRoute, normalizeProcessEntityType } from './processEntityRoute';

describe('normalizeProcessEntityType', () => {
	it('normalizes legacy AR and AP aliases to canonical entity types', () => {
		expect(normalizeProcessEntityType('o2c_ar_payment')).toBe('o2c_payment');
		expect(normalizeProcessEntityType('o2c_arpayment')).toBe('o2c_payment');
		expect(normalizeProcessEntityType('o2c_ar_invoice')).toBe('o2c_invoice');
		expect(normalizeProcessEntityType('p2p_appayment')).toBe('p2p_ap_payment');
	});
});

describe('mapEntityTypeToRoute', () => {
	it('maps canonical and alias entity types to supported process routes', () => {
		expect(mapEntityTypeToRoute('o2c_payment', 'PAY-1')).toBe('/process/ar-payment/PAY-1');
		expect(mapEntityTypeToRoute('o2c_ar_payment', 'PAY-1')).toBe('/process/ar-payment/PAY-1');
		expect(mapEntityTypeToRoute('o2c_ar_invoice', 'INV-1')).toBe('/process/ar-invoice/INV-1');
		expect(mapEntityTypeToRoute('p2p_appayment', 'APP-1')).toBe('/process/ap-payment/APP-1');
		expect(mapEntityTypeToRoute('r2r_fiscal_period', 'FP-1')).toBe('/process/fiscal-period/FP-1');
	});
});