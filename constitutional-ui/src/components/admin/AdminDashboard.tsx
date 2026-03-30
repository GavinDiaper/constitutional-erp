import { Link } from "react-router-dom";

const cards = [
  { to: "/admin/entities", title: "Entity Explorer", copy: "Browse FoundationERP entities and records." },
  { to: "/admin/events", title: "Event Explorer", copy: "Inspect event streams and delivery state." },
  { to: "/admin/process-graphs", title: "Process Graphs", copy: "View process topology and governance paths." },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Interface</h1>
        <p className="text-sm text-slate-600">FoundationERP operational views and constitutional diagnostics.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.to} to={card.to} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
            <h2 className="font-semibold">{card.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{card.copy}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
