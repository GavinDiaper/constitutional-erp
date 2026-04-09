import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import type { EntityActionSankeyLink, EntityActionSankeyModel, EntityActionSankeyNode } from '$lib/types/hub';

interface SankeyRenderNode extends EntityActionSankeyNode {
	x0?: number;
	x1?: number;
	y0?: number;
	y1?: number;
}

interface SankeyRenderLink extends EntityActionSankeyLink {
	width?: number;
}

const levelColors: Record<number, string> = {
	0: '#2f4858',
	1: '#33658a',
	2: '#55a630',
	3: '#f8961e'
};

export interface EntityActionSankeyRenderOptions {
	onNodeClick?: (node: EntityActionSankeyNode) => void;
	clickableLevels?: number[];
	getNodeTooltip?: (node: EntityActionSankeyNode) => string;
}

export function renderEntityActionSankey(
	svgEl: SVGSVGElement,
	model: EntityActionSankeyModel,
	options?: EntityActionSankeyRenderOptions
): void {
	const width = svgEl.clientWidth || 1100;
	const levelCounts = countByLevel(model.nodes);
	const maxColumnCount = Math.max(...Object.values(levelCounts), 1);
	const height = Math.min(1600, Math.max(420, maxColumnCount * 28));
	const horizontalMargin = 18;
	const verticalMargin = 20;

	const svg = d3.select(svgEl);
	svg.selectAll('*').remove();
	svg.attr('viewBox', `0 0 ${width} ${height}`);

	if (model.nodes.length === 0 || model.links.length === 0) {
		renderEmptyState(svg, width, height);
		return;
	}

	const sankeyGraph = sankey<SankeyRenderNode, SankeyRenderLink>()
		.nodeId((node: SankeyRenderNode) => node.id)
		.nodeWidth(18)
		.nodePadding(12)
		.nodeAlign((node: SankeyRenderNode) => node.level)
		.extent([
			[horizontalMargin, verticalMargin],
			[width - horizontalMargin, height - verticalMargin]
		])({
			nodes: model.nodes.map((node) => ({ ...node })),
			links: model.links.map((link) => ({ ...link }))
		});

	const linkPath = sankeyLinkHorizontal<SankeyRenderNode, SankeyRenderLink>();
	const renderedLinks = sankeyGraph.links as SankeyRenderLink[];
	const renderedNodes = sankeyGraph.nodes as SankeyRenderNode[];
	const clickableLevels = new Set(options?.clickableLevels ?? []);

	svg
		.append('g')
		.attr('fill', 'none')
		.attr('stroke-opacity', 0.3)
		.selectAll<SVGPathElement, SankeyRenderLink>('path')
		.data(renderedLinks)
		.join('path')
		.attr('d', (link) => linkPath(link) ?? '')
		.attr('stroke', (link) => (link.isAllowed ? '#55a630' : '#9fb8cf'))
		.attr('stroke-width', (link) => Math.max(1, link.width ?? 0));

	const nodeGroup = svg.append('g').selectAll<SVGGElement, SankeyRenderNode>('g').data(renderedNodes).join('g');

	nodeGroup
		.append('rect')
		.attr('x', (node) => node.x0 ?? 0)
		.attr('y', (node) => node.y0 ?? 0)
		.attr('height', (node) => Math.max(1, (node.y1 ?? 0) - (node.y0 ?? 0)))
		.attr('width', (node) => Math.max(1, (node.x1 ?? 0) - (node.x0 ?? 0)))
		.attr('fill', (node) => levelColors[node.level] ?? '#6c757d')
		.attr('stroke', '#ffffff')
		.attr('stroke-width', 0.75)
		.style('cursor', (node) => (clickableLevels.has(node.level) ? 'pointer' : 'default'))
		.on('click', (_event, node) => {
			if (!clickableLevels.has(node.level)) {
				return;
			}

			options?.onNodeClick?.({
				id: node.id,
				label: node.label,
				level: node.level
			});
		});

	nodeGroup
		.append('title')
		.text((node) => {
			const renderedNode: EntityActionSankeyNode = {
				id: node.id,
				label: node.label,
				level: node.level
			};
			return options?.getNodeTooltip?.(renderedNode) ?? `${node.label} (${levelName(node.level)})`;
		});

	nodeGroup
		.append('text')
		.attr('x', (node) => ((node.x0 ?? 0) < width / 2 ? (node.x1 ?? 0) + 6 : (node.x0 ?? 0) - 6))
		.attr('y', (node) => ((node.y0 ?? 0) + (node.y1 ?? 0)) / 2)
		.attr('dy', '0.35em')
		.attr('text-anchor', (node) => ((node.x0 ?? 0) < width / 2 ? 'start' : 'end'))
		.attr('fill', '#e5eef7')
		.attr('font-size', 11)
		.text((node) => node.label);
}

function countByLevel(nodes: EntityActionSankeyNode[]): Record<number, number> {
	const counts: Record<number, number> = {};
	for (const node of nodes) {
		counts[node.level] = (counts[node.level] ?? 0) + 1;
	}
	return counts;
}

function levelName(level: number): string {
	switch (level) {
		case 0:
			return 'domain';
		case 1:
			return 'aggregate type';
		case 2:
			return 'entity';
		default:
			return 'action';
	}
}

function renderEmptyState(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, width: number, height: number): void {
	svg
		.append('text')
		.attr('x', width / 2)
		.attr('y', height / 2)
		.attr('text-anchor', 'middle')
		.attr('fill', '#d9e3ee')
		.attr('font-size', 13)
		.text('No domain, aggregate, entity, and action data available');
}
