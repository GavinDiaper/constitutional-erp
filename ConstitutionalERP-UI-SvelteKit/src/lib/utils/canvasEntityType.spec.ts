import { describe, expect, it } from 'vitest';

import { toCanvasEntityType } from './canvasEntityType';

describe('toCanvasEntityType', () => {
	it('maps AR and AP entities to supported canvas entity types', () => {
		expect(toCanvasEntityType('O2C', 'ArInvoice')).toBe('o2c_invoice');
		expect(toCanvasEntityType('O2C', 'ArPayment')).toBe('o2c_payment');
		expect(toCanvasEntityType('P2P', 'ApPayment')).toBe('p2p_ap_payment');
	});

	it('accepts legacy acronym casing aliases', () => {
		expect(toCanvasEntityType('O2C', 'ARInvoice')).toBe('o2c_invoice');
		expect(toCanvasEntityType('O2C', 'ARPayment')).toBe('o2c_payment');
		expect(toCanvasEntityType('P2P', 'APPayment')).toBe('p2p_ap_payment');
	});

	it('falls back to generic normalization for supported camel case names', () => {
		expect(toCanvasEntityType('P2P', 'GoodsReceipt')).toBe('p2p_goods_receipt');
		expect(toCanvasEntityType('H2R', 'AuthorityRule')).toBe('h2r_authority_rule');
	});
});