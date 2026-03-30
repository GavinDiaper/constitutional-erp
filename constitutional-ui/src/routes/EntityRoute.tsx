import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import EntityHeader from "../components/canvas/EntityHeader";
import EntityOverview from "../components/canvas/EntityOverview";
import EventTimeline from "../components/canvas/EventTimeline";
import NavigatorPanel from "../components/canvas/NavigatorPanel";
import ProcessGraphPanel from "../components/canvas/ProcessGraphPanel";
import { getProcessState, type ProcessState } from "../api/processApi";

const tabs = ["overview", "process", "events", "navigator"] as const;
type Tab = (typeof tabs)[number];

export default function EntityRoute() {
  const { entityType, entityId } = useParams<{ entityType: string; entityId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [processState, setProcessState] = useState<ProcessState | null>(null);
  const [stateLoading, setStateLoading] = useState(true);
  const [stateError, setStateError] = useState<string | null>(null);

  const safeType = entityType ?? "";
  const safeId = entityId ?? "";

  const refreshProcessState = useCallback(async () => {
    if (!safeType || !safeId) return;
    setStateLoading(true);
    setStateError(null);
    try {
      const next = await getProcessState(safeType, safeId);
      setProcessState(next);
    } catch (err) {
      setStateError(err instanceof Error ? err.message : "Failed to load process");
    } finally {
      setStateLoading(false);
    }
  }, [safeType, safeId]);

  useEffect(() => {
    if (!safeType || !safeId) return;
    void refreshProcessState();
  }, [safeType, safeId, refreshProcessState]);

  return (
    <div className="space-y-4">
      <EntityHeader
        entityType={safeType}
        entityId={safeId}
        state={processState?.state}
        loading={stateLoading}
      />

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
              activeTab === tab
                ? "bg-slate-900 text-white"
                : "bg-slate-100 hover:bg-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        {activeTab === "overview" && (
          <EntityOverview
            processState={processState}
            loading={stateLoading}
            error={stateError}
          />
        )}
        {activeTab === "process" && <ProcessGraphPanel />}
        {activeTab === "events" && (
          <EventTimeline entityType={safeType} entityId={safeId} />
        )}
        {activeTab === "navigator" && processState && (
          <NavigatorPanel
            entityType={safeType}
            entityId={safeId}
            links={processState.links}
            onExecuted={refreshProcessState}
          />
        )}
      </div>
    </div>
  );
}
