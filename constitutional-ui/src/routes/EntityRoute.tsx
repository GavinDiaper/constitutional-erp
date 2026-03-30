import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ProcessGraphPanel from "../components/canvas/ProcessGraphPanel";

const tabs = ["overview", "process", "events", "navigator"] as const;

export default function EntityRoute() {
  const { entityType, entityId } = useParams();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("overview");

  const title = useMemo(() => `${entityType ?? "entity"} ${entityId ?? ""}`.trim(), [entityId, entityType]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 p-4">
        <h1 className="text-2xl font-semibold capitalize">{title}</h1>
        <p className="text-sm text-slate-600">State: Unknown</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === tab ? "bg-slate-900 text-white" : "bg-slate-100"}`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
        {activeTab === "process" ? (
          <ProcessGraphPanel />
        ) : (
          <span>Active tab: {activeTab}. Component-level integration to follow in next implementation slice.</span>
        )}
      </div>
    </div>
  );
}
