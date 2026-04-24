import * as d3 from 'd3';
import type { CaiplPlanEdge, CaiplPlanNode } from '$lib/api/caipl';

const statusColor: Record<CaiplPlanNode['status'], string> = {
	pending: '#64748b',
	active: '#0284c7',
	completed: '#16a34a',
	blocked: '#dc2626',
	failed: '#b91c1c'
};

interface PositionedNode extends CaiplPlanNode {
	x: number;
	y: number;
	layer: number;
}

function computeLayers(nodes: CaiplPlanNode[], edges: CaiplPlanEdge[]): Map<string, number> {
	const indegree = new Map<string, number>(nodes.map((node) => [node.id, 0]));
	const out = new Map<string, string[]>();
	for (const edge of edges) {
		indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
		const current = out.get(edge.from) ?? [];
		current.push(edge.to);
		out.set(edge.from, current);
	}

	const queue: string[] = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
	const layer = new Map<string, number>(nodes.map((node) => [node.id, 0]));

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) {
			continue;
		}

		const currentLayer = layer.get(current) ?? 0;
		for (const next of out.get(current) ?? []) {
			layer.set(next, Math.max(layer.get(next) ?? 0, currentLayer + 1));
			indegree.set(next, (indegree.get(next) ?? 0) - 1);
			if ((indegree.get(next) ?? 0) <= 0) {
				queue.push(next);
			}
		}
	}

	return layer;
}

export function renderLinaPlanView(
	svgEl: SVGSVGElement,
	nodes: CaiplPlanNode[],
	edges: CaiplPlanEdge[],
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
			.text('No plan graph available');
		return;
	}

	const layers = computeLayers(nodes, edges);
	const maxLayer = Math.max(...Array.from(layers.values()), 0);
	const grouped = new Map<number, CaiplPlanNode[]>();
	for (const node of nodes) {
		const layer = layers.get(node.id) ?? 0;
		const current = grouped.get(layer) ?? [];
		current.push(node);
		grouped.set(layer, current);
	}

	const positioned: PositionedNode[] = [];
	for (let layer = 0; layer <= maxLayer; layer += 1) {
		const layerNodes = grouped.get(layer) ?? [];
		const x = ((layer + 1) / (maxLayer + 2)) * width;
		layerNodes.forEach((node, idx) => {
			const y = ((idx + 1) / (layerNodes.length + 1)) * height;
			positioned.push({ ...node, x, y, layer });
		});
	}

	const nodeMap = new Map(positioned.map((node) => [node.id, node]));

	svg
		.append('g')
		.selectAll('line')
		.data(edges)
		.join('line')
		.attr('x1', (d) => nodeMap.get(d.from)?.x ?? 0)
		.attr('y1', (d) => nodeMap.get(d.from)?.y ?? 0)
		.attr('x2', (d) => nodeMap.get(d.to)?.x ?? 0)
		.attr('y2', (d) => nodeMap.get(d.to)?.y ?? 0)
		.attr('stroke', '#94a3b8')
		.attr('stroke-opacity', 0.55)
		.attr('stroke-width', 1.5);

	const node = svg
		.append('g')
		.selectAll('g')
		.data(positioned)
		.join('g')
		.attr('transform', (d) => `translate(${d.x},${d.y})`)
		.style('cursor', 'pointer')
		.on('click', (_, d) => options?.onNodeSelect?.(d.id));

	node
		.append('circle')
		.attr('r', 18)
		.attr('fill', (d) => statusColor[d.status])
		.attr('stroke', (d) => (options?.selectedNodeId === d.id ? '#f59e0b' : '#e2e8f0'))
		.attr('stroke-width', (d) => (options?.selectedNodeId === d.id ? 2.8 : 1.2));

	node
		.append('text')
		.attr('x', 0)
		.attr('y', 30)
		.attr('text-anchor', 'middle')
		.attr('font-size', 10)
		.attr('fill', '#cbd5e1')
		.text((d) => d.label.slice(0, 22));
}
