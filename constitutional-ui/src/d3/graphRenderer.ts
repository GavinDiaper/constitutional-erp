import * as d3 from "d3";

type GraphNode = d3.SimulationNodeDatum & { id: string };
type GraphLink = d3.SimulationLinkDatum<GraphNode> & { source: string | GraphNode; target: string | GraphNode };

export function renderSimpleGraph(container: SVGSVGElement, nodes: GraphNode[], links: GraphLink[]) {
  const svg = d3.select(container);
  svg.selectAll("*").remove();

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 360;
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  const simulation = d3
    .forceSimulation<GraphNode>(nodes)
    .force("link", d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(90))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(width / 2, height / 2));

  const link = svg
    .append("g")
    .attr("stroke", "#8196b0")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", 1.6);

  const node = svg
    .append("g")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.4)
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", 8)
    .attr("fill", "#1d3656");

  const label = svg
    .append("g")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .text((d: GraphNode) => d.id)
    .attr("font-size", 11)
    .attr("fill", "#334155")
    .attr("text-anchor", "middle")
    .attr("dy", -14);

  simulation.on("tick", () => {
    link
      .attr("x1", (d: GraphLink) => ((d.source as GraphNode).x ?? 0))
      .attr("y1", (d: GraphLink) => ((d.source as GraphNode).y ?? 0))
      .attr("x2", (d: GraphLink) => ((d.target as GraphNode).x ?? 0))
      .attr("y2", (d: GraphLink) => ((d.target as GraphNode).y ?? 0));

    node.attr("cx", (d: GraphNode) => d.x ?? 0).attr("cy", (d: GraphNode) => d.y ?? 0);
    label.attr("x", (d: GraphNode) => d.x ?? 0).attr("y", (d: GraphNode) => d.y ?? 0);
  });

  return () => simulation.stop();
}

type FlowEdge = {
  from: string;
  to: string;
  action: string;
  invokeAction?: string;
  available: boolean;
};

export function renderProcessFlowGraph(
  container: SVGSVGElement,
  states: string[],
  edges: FlowEdge[],
  currentState: string,
  onSelectAction: (action: string) => void
) {
  const svg = d3.select(container);
  svg.selectAll("*").remove();

  const width = container.clientWidth || 900;
  const height = container.clientHeight || 360;
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  if (states.length === 0) {
    return () => undefined;
  }

  const marginX = 80;
  const y = height / 2;
  const gap = states.length > 1 ? (width - marginX * 2) / (states.length - 1) : 0;

  const nodePositions = new Map<string, { x: number; y: number }>();
  states.forEach((state, idx) => {
    nodePositions.set(state, { x: marginX + gap * idx, y });
  });

  const edgeLayer = svg.append("g");
  const nodeLayer = svg.append("g");
  const labelLayer = svg.append("g");
  const availableOutgoingActionByState = new Map<string, string>();

  for (const edge of edges) {
    if (edge.available && !availableOutgoingActionByState.has(edge.from)) {
      availableOutgoingActionByState.set(edge.from, edge.invokeAction ?? edge.action);
    }
  }

  edgeLayer
    .selectAll("line")
    .data(edges)
    .join("line")
    .attr("x1", (e) => nodePositions.get(e.from)?.x ?? 0)
    .attr("y1", (e) => nodePositions.get(e.from)?.y ?? 0)
    .attr("x2", (e) => nodePositions.get(e.to)?.x ?? 0)
    .attr("y2", (e) => nodePositions.get(e.to)?.y ?? 0)
    .attr("stroke", (e) => (e.available ? "#1d4ed8" : "#94a3b8"))
    .attr("stroke-width", (e) => (e.available ? 3 : 2))
    .attr("stroke-dasharray", (e) => (e.available ? null : "6 4"));

  // Click targets for transition actions.
  edgeLayer
    .selectAll("text")
    .data(edges)
    .join("text")
    .attr("x", (e) => ((nodePositions.get(e.from)?.x ?? 0) + (nodePositions.get(e.to)?.x ?? 0)) / 2)
    .attr("y", (e) => ((nodePositions.get(e.from)?.y ?? 0) + (nodePositions.get(e.to)?.y ?? 0)) / 2 - 10)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("font-family", "ui-monospace, SFMono-Regular, Menlo, monospace")
    .attr("fill", (e) => (e.available ? "#1e3a8a" : "#64748b"))
    .style("cursor", (e) => (e.available ? "pointer" : "default"))
    .text((e) => e.action)
    .on("click", (_evt, e) => {
      if (e.available) {
        onSelectAction(e.invokeAction ?? e.action);
      }
    });

  nodeLayer
    .selectAll("circle")
    .data(states)
    .join("circle")
    .attr("cx", (s) => nodePositions.get(s)?.x ?? 0)
    .attr("cy", (s) => nodePositions.get(s)?.y ?? 0)
    .attr("r", 16)
    .attr("stroke", "#0f172a")
    .attr("stroke-width", (s) => (s === currentState ? 3 : 1.5))
    .attr("fill", (s) => (s === currentState ? "#2563eb" : "#e2e8f0"))
    .style("cursor", (s) => (availableOutgoingActionByState.has(s) ? "pointer" : "default"))
    .on("click", (_evt, s) => {
      const action = availableOutgoingActionByState.get(s);
      if (action) {
        onSelectAction(action);
      }
    });

  labelLayer
    .selectAll("text")
    .data(states)
    .join("text")
    .attr("x", (s) => nodePositions.get(s)?.x ?? 0)
    .attr("y", (s) => (nodePositions.get(s)?.y ?? 0) + 34)
    .attr("text-anchor", "middle")
    .attr("font-size", 12)
    .attr("fill", "#334155")
    .text((s) => s);

  return () => undefined;
}
