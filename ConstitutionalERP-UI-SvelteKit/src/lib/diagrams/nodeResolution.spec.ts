import { describe, expect, it } from 'vitest';

import {
	buildDiagramLabelMap,
	extractDiagramNodeSpecs,
	resolveDiagramNodeIdFromContent
} from './nodeResolution';

describe('resolveDiagramNodeIdFromContent', () => {
	it('resolves an exact ER entity label without colliding with shorter prefixes', () => {
		const labelToId = buildDiagramLabelMap([
			{ id: 'F_p2p_supplier', labels: ['F_p2p_supplier'] },
			{ id: 'F_p2p_supplier_invoice', labels: ['F_p2p_supplier_invoice'] }
		]);

		expect(resolveDiagramNodeIdFromContent('F_p2p_supplier_invoice', labelToId)).toBe(
			'F_p2p_supplier_invoice'
		);
	});

	it('resolves ER entity groups that also include field text', () => {
		const labelToId = buildDiagramLabelMap([
			{ id: 'F_p2p_goods_receipt', labels: ['F_p2p_goods_receipt'] },
			{ id: 'F_p2p_ap_payment', labels: ['F_p2p_ap_payment'] }
		]);

		expect(
			resolveDiagramNodeIdFromContent(
				'F_p2p_goods_receipt receipt_id PK po_id state received_at',
				labelToId
			)
		).toBe('F_p2p_goods_receipt');

		expect(
			resolveDiagramNodeIdFromContent(
				'F_p2p_ap_payment ap_payment_id PK supplier_invoice_id amount',
				labelToId
			)
		).toBe('F_p2p_ap_payment');
	});

	it('returns null for ambiguous content that references multiple diagram nodes', () => {
		const labelToId = buildDiagramLabelMap([
			{ id: 'F_p2p_purchase_order', labels: ['F_p2p_purchase_order'] },
			{ id: 'F_p2p_supplier_invoice', labels: ['F_p2p_supplier_invoice'] }
		]);

		expect(
			resolveDiagramNodeIdFromContent(
				'F_p2p_purchase_order converts_to F_p2p_supplier_invoice',
				labelToId
			)
		).toBeNull();
	});
});

describe('extractDiagramNodeSpecs', () => {
	it('extracts foundation p2p diagram nodes including receipt, invoice, and payment', () => {
		const definition = `erDiagram
    F_p2p_requisition ||--o{ F_p2p_requisition_line : has
    F_p2p_supplier ||--o{ F_p2p_purchase_order : receives
    F_p2p_purchase_order ||--o{ F_p2p_goods_receipt : receives
    F_p2p_purchase_order ||--o{ F_p2p_supplier_invoice : billed_by
    F_p2p_supplier_invoice ||--o{ F_p2p_ap_payment : settled_by`;

		const nodeIds = extractDiagramNodeSpecs(definition).map((node) => node.id);

		expect(nodeIds).toContain('F_p2p_goods_receipt');
		expect(nodeIds).toContain('F_p2p_supplier_invoice');
		expect(nodeIds).toContain('F_p2p_ap_payment');
	});
});