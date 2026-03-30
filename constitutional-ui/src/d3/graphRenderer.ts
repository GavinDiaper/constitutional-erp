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
