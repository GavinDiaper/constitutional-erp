import { describe, expect, it } from 'vitest';

import {
	buildEntityActionSankeyModel,
	buildInteractiveAggregateDrilldownSankeyModel,
	buildInteractiveDomainDrilldownSankeyModel
} from './sankey';
import type { McpFunctionSummary } from '$lib/types/hub';

function sampleFunctions(): McpFunctionSummary[] {
	return [
		{
			id: '1',
			domain: 'O2C',
			aggregateType: 'Quote',
			action: 'create',
			operationType: 'create'
		},
		{
			id: '2',
			domain: 'O2C',
			aggregateType: 'Quote',
			action: 'submit',
			operationType: 'transition'
		},
		{
			id: '3',
			domain: 'O2C',
			aggregateType: 'Quote',
			action: 'approve',
			operationType: 'transition'
		},
		{
			id: '4',
			domain: 'P2P',
			aggregateType: 'Requisition',
			action: 'submit',
			operationType: 'transition'
		}
	];
}

describe('sankey interactive drilldown', () => {
	it('builds domain drilldown without parameter nodes and with remapped levels', () => {
		const aggregateIds = new Map<string, string[]>([
			['o2c|Quote', ['QUO-1', 'QUO-2']],
			['p2p|Requisition', ['REQ-1']]
		]);
		const baseModel = buildEntityActionSankeyModel(sampleFunctions(), aggregateIds);

		const model = buildInteractiveDomainDrilldownSankeyModel(baseModel, 'O2C');

		expect(model.nodes.some((node) => node.id.startsWith('param:'))).toBe(false);
		expect(model.nodes.some((node) => node.id === 'domain:O2C')).toBe(false);
		expect(model.nodes.some((node) => node.id === 'aggregate:O2C|Quote' && node.level === 0)).toBe(true);
		expect(model.nodes.some((node) => node.id === 'instance:O2C|Quote|QUO-1' && node.level === 1)).toBe(true);
		expect(model.nodes.some((node) => node.id === 'action:O2C|Quote|submit' && node.level === 2)).toBe(true);
	});

	it('builds aggregate drilldown where aggregate ID is level 1 and actions are level 2', () => {
		const aggregateIds = new Map<string, string[]>([['o2c|Quote', ['QUO-1']]]);
		const baseModel = buildEntityActionSankeyModel(sampleFunctions(), aggregateIds);

		const model = buildInteractiveAggregateDrilldownSankeyModel(baseModel, 'aggregate:O2C|Quote');

		expect(model.nodes.some((node) => node.id === 'aggregate:O2C|Quote' && node.level === 0)).toBe(true);
		expect(model.nodes.some((node) => node.id === 'instance:O2C|Quote|QUO-1' && node.level === 1)).toBe(true);
		expect(model.nodes.some((node) => node.id === 'action:O2C|Quote|submit' && node.level === 2)).toBe(true);
		expect(model.links.some((link) => link.source === 'instance:O2C|Quote|QUO-1' && link.target === 'action:O2C|Quote|submit')).toBe(true);
	});

	it('returns empty aggregate drilldown for invalid aggregate node id', () => {
		const aggregateIds = new Map<string, string[]>([['o2c|Quote', ['QUO-1']]]);
		const baseModel = buildEntityActionSankeyModel(sampleFunctions(), aggregateIds);

		const model = buildInteractiveAggregateDrilldownSankeyModel(baseModel, 'domain:O2C');
		expect(model.nodes).toEqual([]);
		expect(model.links).toEqual([]);
	});
});
