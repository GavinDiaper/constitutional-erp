import * as d3 from 'd3';
import type { ProcessFlowDefinition } from '$lib/types/hub';

interface RenderOptions {
	highlightedStepId?: string | null;
}

export function renderCompactFlow(
	svgEl: SVGSVGElement,
	flow: ProcessFlowDefinition | null,
	options: RenderOptions = {}
): void {
	const width = svgEl.clientWidth || 860;
	const height = 170;
	const highlightedStepId = options.highlightedStepId ?? null;

	const svg = d3.select(svgEl);
	svg.selectAll('*').remove();
	svg.attr('viewBox', `0 0 ${width} ${height}`);

	if (!flow || flow.nodes.length === 0) {
		svg
			.append('text')
			.attr('x', width / 2)
			.attr('y', height / 2)
			.attr('text-anchor', 'middle')
			.attr('fill', '#c7d8e6')
			.attr('font-size', 12)
			.text('No flow steps available');
		return;
	}

	const marginX = 26;
	const trackWidth = Math.max(width - marginX * 2, 120);
	const nodeCount = flow.nodes.length;
	const stepSpacing = nodeCount > 1 ? trackWidth / (nodeCount - 1) : 0;
	const axisY = 74;

	svg
		.append('line')
		.attr('x1', marginX)
		.attr('x2', marginX + trackWidth)
		.attr('y1', axisY)
		.attr('y2', axisY)
		.attr('stroke', '#4b6f8f')
		.attr('stroke-width', 2);

	const nodeGroup = svg.append('g').selectAll('g').data(flow.nodes).join('g');

	nodeGroup
		.append('line')
		.attr('x1', (_node, index) => marginX + stepSpacing * index)
		.attr('x2', (_node, index) => marginX + stepSpacing * index)
		.attr('y1', axisY + 12)
		.attr('y2', axisY + 22)
		.attr('stroke', '#6f92ad')
		.attr('stroke-width', 1);

	nodeGroup
		.append('circle')
		.attr('cx', (_node, index) => marginX + stepSpacing * index)
		.attr('cy', axisY)
		.attr('r', (node) => (node.id === highlightedStepId ? 9 : 6))
		.attr('fill', (node) => (node.id === highlightedStepId ? '#f7b500' : '#6fc2ff'))
		.attr('stroke', '#0f2238')
		.attr('stroke-width', 1.5);

	nodeGroup
		.append('text')
		.attr('x', (_node, index) => marginX + stepSpacing * index)
		.attr('y', axisY + 36)
		.attr('text-anchor', 'middle')
		.attr('font-size', 10)
		.attr('fill', '#dce9f4')
		.text((node) => String(node.sequence));

	nodeGroup
		.append('title')
		.text((node) => `${node.sequence}. ${node.requestName}\n${node.httpMethod} ${node.requestPath}`);
}
