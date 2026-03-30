import { Link } from "react-router-dom";

export default function NotFoundRoute() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Page Not Found</h1>
      <p className="text-sm text-slate-600">The route does not exist in the current scaffold.</p>
      <Link to="/" className="text-sm text-blue-700 underline">Go home</Link>
    </div>
  );
}
