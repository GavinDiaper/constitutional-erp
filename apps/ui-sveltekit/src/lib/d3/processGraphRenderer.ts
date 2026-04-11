import * as d3 from 'd3';
import type { ProcessGraphModel } from '$lib/types/hub';

const riskColors: Record<string, string> = {
	low: '#7bd88f',
	medium: '#ffd166',
	high: '#e00000'
};

export function renderProcessGraph(svgEl: SVGSVGElement, model: ProcessGraphModel): void {
	const width = svgEl.clientWidth || 820;
	const height = 320;

	const svg = d3.select(svgEl);
	svg.selectAll('*').remove();
	svg.attr('viewBox', `0 0 ${width} ${height}`);

	if (model.nodes.length === 0) {
		svg
			.append('text')
			.attr('x', width / 2)
			.attr('y', height / 2)
			.attr('text-anchor', 'middle')
			.attr('fill', '#d9e3ee')
			.text('No process graph available');
		return;
	}

	const nodeSpacing = width / Math.max(model.nodes.length, 2);
	const nodeY = height / 2;

	const nodeMap = new Map(
		model.nodes.map((node, index) => [
			node,
			{ label: node, x: nodeSpacing * index + nodeSpacing / 2, y: nodeY }
		])
	);

	svg
		.append('g')
		.selectAll('line')
		.data(model.edges)
		.join('line')
		.attr('x1', (edge) => nodeMap.get(edge.from)?.x ?? 0)
		.attr('y1', (edge) => nodeMap.get(edge.from)?.y ?? 0)
		.attr('x2', (edge) => nodeMap.get(edge.to)?.x ?? 0)
		.attr('y2', (edge) => nodeMap.get(edge.to)?.y ?? 0)
		.attr('stroke', (edge) => riskColors[edge.risk])
		.attr('stroke-width', 2)
		.attr('stroke-dasharray', (edge) => (edge.risk === 'high' ? '4 4' : '0'));

	const nodeGroup = svg.append('g').selectAll('g').data(Array.from(nodeMap.values())).join('g');

	nodeGroup
		.append('circle')
		.attr('cx', (node) => node.x)
		.attr('cy', (node) => node.y)
		.attr('r', 26)
		.attr('fill', (node) => (node.label === model.currentState ? '#e00000' : '#274f7b'))
		.attr('stroke', '#ffffff')
		.attr('stroke-width', 1.5);

	nodeGroup
		.append('text')
		.attr('x', (node) => node.x)
		.attr('y', (node) => node.y + 5)
		.attr('text-anchor', 'middle')
		.attr('font-size', 11)
		.attr('fill', '#ffffff')
		.text((node) => node.label);
}
