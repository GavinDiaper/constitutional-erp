import bgImage from "../../assets/images/backgroundFrontPage.png";

export default function HomeRoute() {
  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border border-slate-200 bg-cover bg-center p-8 text-white"
        style={{ backgroundImage: `linear-gradient(120deg, rgba(29,54,86,0.9), rgba(0,57,57,0.8)), url(${bgImage})` }}
      >
        <h1 className="mb-3 text-3xl font-semibold">ConstitutionalERP - Enterprise that governs itself</h1>
        <p className="max-w-3xl text-slate-100">
          ConstitutionalERP combines FoundationERP with a constitutional AI layer that navigates processes,
          respects governance, and executes with mathematical clarity.
        </p>
      </section>
    </div>
  );
}
