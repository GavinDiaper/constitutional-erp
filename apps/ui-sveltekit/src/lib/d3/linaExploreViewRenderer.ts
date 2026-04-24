import * as d3 from 'd3';
import type { CaiplPlanEdge, CaiplPlanNode } from '$lib/api/caipl';

const statusColor: Record<CaiplPlanNode['status'], string> = {
	pending: '#64748b',
	active: '#0284c7',
	completed: '#16a34a',
	blocked: '#dc2626',
	failed: '#b91c1c'
};

interface TreeNode {
	id: string;
	label: string;
	status: CaiplPlanNode['status'];
	children?: TreeNode[];
}

function buildTree(nodes: CaiplPlanNode[], edges: CaiplPlanEdge[]): TreeNode {
	const childrenMap = new Map<string, string[]>();
	const incoming = new Set<string>();
	for (const edge of edges) {
		const list = childrenMap.get(edge.from) ?? [];
		list.push(edge.to);
		childrenMap.set(edge.from, list);
		incoming.add(edge.to);
	}

	const rootNode = nodes.find((node) => !incoming.has(node.id)) ?? nodes[0];
	const nodeMap = new Map(nodes.map((node) => [node.id, node]));
	const visited = new Set<string>();

	function walk(nodeId: string, depth = 0): TreeNode {
		const node = nodeMap.get(nodeId) ?? nodes[0];
		if (!node || depth > 5 || visited.has(nodeId)) {
			return {
				id: nodeId,
				label: node?.label ?? nodeId,
				status: node?.status ?? 'pending'
			};
		}
		visited.add(nodeId);
		const childIds = (childrenMap.get(nodeId) ?? []).slice(0, 20);
		return {
			id: node.id,
			label: node.label,
			status: node.status,
			children: childIds.map((childId) => walk(childId, depth + 1))
		};
	}

	return walk(rootNode.id);
}

export function renderLinaExploreView(
	svgEl: SVGSVGElement,
	nodes: CaiplPlanNode[],
	edges: CaiplPlanEdge[],
	options?: { onNodeSelect?: (nodeId: string) => void; selectedNodeId?: string | null }
): void {
	const width = svgEl.clientWidth || 620;
	const height = 360;
	const radius = Math.min(width, height) / 2 - 36;

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
			.text('No entity graph available');
		return;
	}

	const root = d3.hierarchy<TreeNode>(buildTree(nodes, edges));
	d3.cluster<TreeNode>().size([2 * Math.PI, radius])(root);

	const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);

	g
		.append('g')
		.selectAll('line')
		.data(root.links())
		.join('line')
		.attr('x1', (d) => Math.cos(d.source.x - Math.PI / 2) * d.source.y)
		.attr('y1', (d) => Math.sin(d.source.x - Math.PI / 2) * d.source.y)
		.attr('x2', (d) => Math.cos(d.target.x - Math.PI / 2) * d.target.y)
		.attr('y2', (d) => Math.sin(d.target.x - Math.PI / 2) * d.target.y)
		.attr('stroke', '#94a3b8')
		.attr('stroke-opacity', 0.5)
		.attr('stroke-width', 1.2);

	const node = g
		.append('g')
		.selectAll('g')
		.data(root.descendants())
		.join('g')
		.attr('transform', (d) => `translate(${Math.cos(d.x - Math.PI / 2) * d.y},${Math.sin(d.x - Math.PI / 2) * d.y})`)
		.style('cursor', 'pointer')
		.on('click', (_, d) => options?.onNodeSelect?.(d.data.id));

	node
		.append('circle')
		.attr('r', 12)
		.attr('fill', (d) => statusColor[d.data.status])
		.attr('stroke', (d) => (options?.selectedNodeId === d.data.id ? '#f59e0b' : '#e2e8f0'))
		.attr('stroke-width', (d) => (options?.selectedNodeId === d.data.id ? 2.2 : 1));

	node
		.append('text')
		.attr('x', 0)
		.attr('y', 22)
		.attr('text-anchor', 'middle')
		.attr('font-size', 9)
		.attr('fill', '#cbd5e1')
		.text((d) => d.data.label.slice(0, 14));
}
