import { Link } from "react-router-dom";

const entities = ["customers", "quotes", "orders", "invoices", "payments", "suppliers", "requisitions", "purchase-orders", "journals", "employees"];

export default function CanvasRoute() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Canvas</h1>
      <p className="text-sm text-slate-600">Select an entity to inspect process state, governance links, events, and navigator actions.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entities.map((entity) => (
          <Link key={entity} to={`/canvas/${entity}/sample-${entity}`} className="rounded-xl border border-slate-200 p-4 hover:border-slate-400">
            <div className="text-sm font-medium capitalize">{entity.replace("-", " ")}</div>
            <div className="text-xs text-slate-500">Open process view</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
