import * as d3 from 'd3';
import type { CaiplPlanEdge, CaiplPlanNode } from '$lib/api/caipl';

const lanes: Array<CaiplPlanNode['status']> = ['pending', 'active', 'completed', 'blocked', 'failed'];

const laneColor: Record<CaiplPlanNode['status'], string> = {
	pending: '#334155',
	active: '#075985',
	completed: '#166534',
	blocked: '#991b1b',
	failed: '#7f1d1d'
};

export function renderLinaStatusView(
	svgEl: SVGSVGElement,
	nodes: CaiplPlanNode[],
	_edges: CaiplPlanEdge[],
	options?: { onNodeSelect?: (nodeId: string) => void; selectedNodeId?: string | null }
): void {
	const width = svgEl.clientWidth || 620;
	const height = 360;

	const svg = d3.select(svgEl);
	svg.selectAll('*').remove();
	svg.attr('viewBox', `0 0 ${width} ${height}`);

	if (nodes.length === 0) {
		svg
			.append('text')
			.attr('x', width / 2)
			.attr('y', height / 2)
			.attr('text-anchor', 'middle')
			.attr('fill', '#94a3b8')
			.text('No status cards available');
		return;
	}

	const laneWidth = width / lanes.length;

	lanes.forEach((lane, laneIndex) => {
		const x = laneIndex * laneWidth;
		svg
			.append('rect')
			.attr('x', x + 4)
			.attr('y', 4)
			.attr('width', laneWidth - 8)
			.attr('height', height - 8)
			.attr('fill', 'rgba(15, 23, 42, 0.22)')
			.attr('stroke', '#475569')
			.attr('stroke-width', 1)
			.attr('rx', 8);

		svg
			.append('text')
			.attr('x', x + laneWidth / 2)
			.attr('y', 20)
			.attr('text-anchor', 'middle')
			.attr('font-size', 10)
			.attr('fill', '#e2e8f0')
			.text(lane.toUpperCase());

		const cards = nodes.filter((node) => node.status === lane).slice(0, 12);
		cards.forEach((card, cardIndex) => {
			const y = 32 + cardIndex * 26;
			const group = svg
				.append('g')
				.style('cursor', 'pointer')
				.on('click', () => options?.onNodeSelect?.(card.id));

			group
				.append('rect')
				.attr('x', x + 10)
				.attr('y', y)
				.attr('width', laneWidth - 20)
				.attr('height', 20)
				.attr('rx', 5)
				.attr('fill', laneColor[lane])
				.attr('stroke', options?.selectedNodeId === card.id ? '#f59e0b' : '#e2e8f0')
				.attr('stroke-width', options?.selectedNodeId === card.id ? 1.8 : 0.8);

			group
				.append('text')
				.attr('x', x + 16)
				.attr('y', y + 14)
				.attr('font-size', 9)
				.attr('fill', '#f8fafc')
				.text(card.label.slice(0, 18));
		});
	});
}
