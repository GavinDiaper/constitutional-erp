import type { ProcessLink } from "../../api/processApi";
import { useEffect, useRef } from "react";
import { renderProcessFlowGraph } from "../../d3/graphRenderer";
import { buildProcessGraphModel } from "../../d3/processGraphModel";

interface Props {
  entityType: string;
  currentState: string;
  links: ProcessLink[];
  onSelectAction: (action: string) => void;
}

export default function ProcessGraphPanel({
  entityType,
  currentState,
  links,
  onSelectAction,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const graph = buildProcessGraphModel(entityType, currentState, links);

  useEffect(() => {
    if (!svgRef.current) {
      return;
    }

    const cleanup = renderProcessFlowGraph(
      svgRef.current,
      graph.states,
      graph.transitions.map((t) => ({
        ...t,
        action: t.action,
        invokeAction: t.invokeAction,
      })),
      graph.currentState,
      onSelectAction
    );

    return () => {
      cleanup();
    };
  }, [graph.currentState, graph.states, graph.transitions, onSelectAction]);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 p-4">
      <h2 className="mb-3 text-lg font-semibold">Process Graph</h2>

      <svg ref={svgRef} className="h-[340px] w-full rounded-lg bg-slate-50" />
      <p className="text-xs text-slate-500">
        Click an available transition label or actionable state node to open it in Navigator.
      </p>
    </section>
  );
}
