import { useEffect, useRef } from "react";
import { renderSimpleGraph } from "../../d3/graphRenderer";

export default function ProcessGraphPanel() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) {
      return;
    }

    const cleanup = renderSimpleGraph(
      svgRef.current,
      [
        { id: "start" },
        { id: "validate" },
        { id: "approve" },
        { id: "complete" },
      ],
      [
        { source: "start", target: "validate" },
        { source: "validate", target: "approve" },
        { source: "approve", target: "complete" },
      ]
    );

    return () => {
      cleanup();
    };
  }, []);

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h2 className="mb-3 text-lg font-semibold">Process Graph</h2>
      <svg ref={svgRef} className="h-[320px] w-full rounded-lg bg-slate-50" />
    </section>
  );
}
