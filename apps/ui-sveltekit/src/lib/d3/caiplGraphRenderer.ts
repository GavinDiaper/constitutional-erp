import * as d3 from 'd3';
import type { CaiplPlanEdge, CaiplPlanNode } from '$lib/api/caipl';

interface SimulationNode extends d3.SimulationNodeDatum {
	id: string;
	label: string;
	type: CaiplPlanNode['type'];
	status: CaiplPlanNode['status'];
}

interface SimulationEdge extends d3.SimulationLinkDatum<SimulationNode> {
	edgeId: string;
	type: CaiplPlanEdge['type'];
	source: string | SimulationNode;
	target: string | SimulationNode;
}

const statusColor: Record<CaiplPlanNode['status'], string> = {
	pending: '#64748b',
	active: '#0284c7',
	completed: '#16a34a',
	blocked: '#dc2626',
	failed: '#b91c1c'
};

export function renderCaiplGraph(
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

	const simulationNodes: SimulationNode[] = nodes.map((node) => ({
		id: node.id,
		label: node.label,
		type: node.type,
		status: node.status
	}));

	const simulationEdges: SimulationEdge[] = edges.map((edge) => ({
		edgeId: edge.edgeId,
		type: edge.type,
		source: edge.from,
		target: edge.to
	}));

	const linkGroup = svg.append('g').attr('stroke', '#94a3b8').attr('stroke-opacity', 0.55);
	const nodeGroup = svg.append('g');

	const link = linkGroup
		.selectAll<SVGLineElement, SimulationEdge>('line')
		.data(simulationEdges, (d) => d.edgeId)
		.join('line')
		.attr('stroke-width', 1.5);

	const node = nodeGroup
		.selectAll<SVGGElement, SimulationNode>('g')
		.data(simulationNodes, (d) => d.id)
		.join('g');

	node
		.append('circle')
		.attr('r', 18)
		.attr('fill', (d) => statusColor[d.status])
		.attr('stroke', (d) => (options?.selectedNodeId === d.id ? '#f59e0b' : '#e2e8f0'))
		.attr('stroke-width', (d) => (options?.selectedNodeId === d.id ? 2.8 : 1.2));

	node
		.style('cursor', 'pointer')
		.on('click', (_, d) => {
			options?.onNodeSelect?.(d.id);
		});

	node
		.append('text')
		.attr('x', 0)
		.attr('y', 30)
		.attr('text-anchor', 'middle')
		.attr('font-size', 10)
		.attr('fill', '#cbd5e1')
		.text((d) => d.label.slice(0, 22));

	const simulation = d3
		.forceSimulation(simulationNodes)
		.force(
			'link',
			d3
				.forceLink<SimulationNode, SimulationEdge>(simulationEdges)
				.id((d) => d.id)
				.distance(110)
		)
		.force('charge', d3.forceManyBody().strength(-320))
		.force('center', d3.forceCenter(width / 2, height / 2))
		.force('collision', d3.forceCollide(38))
		.alphaDecay(0.09)
		.on('tick', () => {
			link
				.attr('x1', (d) => (d.source as SimulationNode).x ?? 0)
				.attr('y1', (d) => (d.source as SimulationNode).y ?? 0)
				.attr('x2', (d) => (d.target as SimulationNode).x ?? 0)
				.attr('y2', (d) => (d.target as SimulationNode).y ?? 0);

			node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
		});
}
