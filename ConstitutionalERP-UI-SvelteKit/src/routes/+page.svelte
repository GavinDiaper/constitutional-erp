<script lang="ts">
	import { base, resolve } from '$app/paths';
	import { diagramCatalog } from '$lib/diagrams/catalog';

	const logoUrl = `${base}/images/Provisa.svg`;
	const frontPageBackgroundUrl = `${base}/images/backgroundFrontPage.png`;
	const gMarkUrl = `${base}/images/G.png`;
	const featuredDiagramBoxes = diagramCatalog.filter((item) => item.system !== 'Cross-System');
</script>

<section class="home-shell relative overflow-hidden rounded-2xl border border-white/30 p-6 md:p-10">
	<img
		class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-28"
		src={frontPageBackgroundUrl}
		alt=""
	/>
	<img
		class="pointer-events-none absolute -right-8 -top-10 w-44 opacity-80 md:w-56"
		src={gMarkUrl}
		alt=""
	/>

	<div class="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-center">
		<div>
			<div class="inline-block">
				<img class="h-16 w-auto md:h-20" src={logoUrl} alt="Provisa logo" />
			</div>

			<h1 class="mt-6 text-4xl font-semibold text-slate-900 md:text-5xl">Foundation ERP v2</h1>
			<p class="mt-4 max-w-3xl text-sm leading-7 text-slate-800/95 md:text-base">
				Foundation ERP v2 is the canonical ERP model and execution engine for the Constitutional stack.
				It provides a stable, complete core across O2C, P2P, R2R, and H2R, emits replayable canonical
				events, and supports portable command mappings into ERP-specific APIs through Mesh.
			</p>

			<p class="mt-4 max-w-3xl text-sm leading-7 text-slate-800/95 md:text-base">
				This system is designed as the ERP-agnostic backbone for Integration Hub, Process Graph, Mesh,
				Navigator, and Canvas.
			</p>

			<div class="mt-8 flex flex-wrap gap-3">
				<a class="rounded-md bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800" href={resolve('/dashboard')}>
					Open Dashboard
				</a>
				<a class="rounded-md border border-slate-700/40 bg-white/75 px-4 py-2 font-semibold text-slate-900 hover:bg-white" href={resolve('/canvas')}>
					Open Canvas
				</a>
				<a class="rounded-md border border-slate-700/40 bg-white/75 px-4 py-2 font-semibold text-slate-900 hover:bg-white" href={resolve('/diagrams')}>
					Open Diagram Explorer
				</a>
			</div>
		</div>

		<aside class="rounded-xl border border-slate-600/20 bg-white/70 p-5 backdrop-blur-sm">
			<h2 class="text-lg font-semibold text-slate-900">System Highlights</h2>
			<ul class="mt-3 space-y-2 text-sm text-slate-800">
				<li>Canonical model across major ERP domains.</li>
				<li>Replayable business events for governance and audit.</li>
				<li>Portable API command mapping through Mesh.</li>
				<li>Process-first execution across Constitutional services.</li>
			</ul>
		</aside>
	</div>
</section>

<section class="mt-10 rounded-2xl border border-white/30 bg-white/80 p-6 md:p-10">
	<h2 class="text-2xl font-semibold text-slate-900">Architecture Diagram Explorer</h2>
	<p class="mt-3 text-sm text-slate-800/95">
		Click any box to open the dedicated system or domain diagram page.
	</p>
	<div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each featuredDiagramBoxes as box}
			<a class={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow ${box.accentClass}`} href={resolve(`/diagrams/${box.id}`)}>
				<p class="text-sm font-semibold text-slate-900">{box.title}</p>
				<p class="mt-2 text-xs text-slate-700">{box.summary}</p>
			</a>
		{/each}
	</div>
</section>

<section class="mt-10 rounded-2xl border border-white/30 p-6 md:p-10">
<h2 class="text-2xl font-semibold">Constitutional ERP</h2>
<p class="mt-4 text-sm text-white-800/95">Constitutional ERP is an AI executed, human governed enterprise system built on an immutable constitutional fabric that guarantees process integrity, authority control, and reconstructable operations across a distributed mesh.</p>

<img class="mt-6 w-full rounded-md border border-white/30" src={`${base}/images/Architecture(Future)t.png`} alt="Diagram illustrating the architecture of a Constitutional ERP system, showing the AI execution layer, human governance layer, constitutional fabric, and mesh architecture." />

<section class="mt-10 rounded-2xl border border-white/30 p-6 md:p-10">
<h2 class="text-2xl font-semibold">Category Description</h2>

<p class="mt-4 text-sm text-white-800/95">Constitutional ERP is an emerging class of enterprise platforms that combine AI driven operational execution with governance anchored control frameworks to deliver resilient, autonomous, and reconstructable business systems. Unlike traditional ERP suites, which rely on role based workflows and monolithic data models, Constitutional ERPs operate on a distributed constitutional fabric that enforces non bypassable rules, process integrity, and earned authority across all business domains.
</p>
<p class="mt-4 text-sm text-white-800/95">
Constitutional ERPs use AI as the primary execution engine, interpreting process state, proposing next actions, and automating routine operations. Human users act as governors rather than operators, providing oversight, approvals, and corrective interventions. A constitutional layer — composed of immutable rules, domain constraints, and authority models — ensures that neither AI nor human actors can violate enterprise policy, regulatory requirements, or process integrity.
</p>
<p class="mt-4 text-sm text-white-800/95">
At the architectural level, Constitutional ERPs are defined by event sourced temporal ledgers, distributed mesh fabrics, and hypermedia driven process graphs. These systems maintain a complete, immutable record of all operational events, enabling full rollback, replay, and system reconstruction across heterogeneous ERP backends. This allows organizations to operate with unprecedented resilience, auditability, and vendor independence.
</p>
<p class="mt-4 text-sm text-white-800/95">

Gartner expects Constitutional ERP platforms to be adopted first in industries with high regulatory exposure, complex multi entity operations, or strong requirements for auditability and operational continuity. Over time, the category is likely to expand into mainstream enterprise operations as organizations seek to modernize legacy ERP estates, reduce operational overhead, and adopt AI driven execution models without sacrificing governance or control.
</p>
</section>
<section class="mt-10 rounded-2xl border border-white/30 p-6 md:p-10">
<h2 class="text-2xl font-semibold">Key Characteristics of Constitutional ERP</h2>
<ul class="mt-4 text-sm text-white-800/95">
<li>AI Driven Execution: AI navigates processes, proposes and executes actions, and provides explainability.</li>
<li>Human Anchored Governance: Users act as approvers and governors, with authority determined by earned credentials and risk tiers.</li>
<li>Constitutional Control Layer: Immutable rules and domain constraints enforce compliance and prevent unauthorized actions.</li>
</ul>
<p class="mt-4 text-sm text-white-800/95">Immutable rules and domain constraints enforce compliance and prevent unauthorized actions.</p>
<ul class="mt-4 text-sm text-white-800/95">
<li>Event Sourced Temporal Integrity: All operations are recorded as immutable events, enabling rollback, replay, and full system reconstruction.</li>
<li>Mesh Native Architecture: Distributed fabric ensures resilience, continuity, and multi ERP interoperability.</li>
<li>Process First UX: Interfaces expose state driven affordances rather than role based menus or modules.</li>
</ul>
<h2 class="text-2xl font-semibold">Market Drivers</h2>
<ul class="mt-4 text-sm text-white-800/95">
<li>Rising demand for AI enabled operational automation</li>
<li>Increasing regulatory pressure for auditability and traceability</li>
<li>Need for resilient, reconstructable enterprise systems</li>
<li>Desire to reduce dependency on monolithic ERP vendors</li>
<li>Shift toward distributed, multi entity operating models</li>
</ul>
<h2 class="text-2xl font-semibold">Category Definition: Constitutional ERP</h2>
<p class="mt-4 text-sm text-white-800/95">

Constitutional ERP is a new category of enterprise system in which AI executes operations, humans govern decisions, and a constitutional fabric enforces the rules that neither can bypass.
It replaces role based interfaces and monolithic back office systems with a process first, state driven architecture built on immutable events, distributed mesh resilience, and earned authority.
</p>
</section>
<section class="mt-10 rounded-2xl border border-white/30 p-6 md:p-10">
<h2 class="text-2xl font-semibold">Constitutional ERP is defined by five core principles:</h2>
<ul class="mt-4 text-sm text-white-800/95">
<li><strong>AI Driven Execution</strong>: The system’s primary operator is an AI Navigator that interprets process state, proposes next actions, executes transitions, and explains its reasoning. Humans intervene only where governance requires it.</li>
<li><strong>Human Anchored Governance</strong>: Authority is earned, contextual, and revocable. Humans approve, correct, and oversee, but do not manually drive every step. Governance is structural, not procedural.</li>
<li><strong>Constitutional Constraints</strong>: A Charter Engine enforces immutable rules, domain boundaries, and non bypassable limits. Neither AI nor humans can violate the constitution of the enterprise.</li>
<li><strong>Temporal Integrity</strong>: All operations are recorded as events in a Ledger that supports versioning, rollback, and replay. Any system state, including external ERPs, can be reconstructed from the constitutional record.</li>
<li><strong>Mesh Native Architecture</strong>: A distributed Mesh Fabric ensures resilience, continuity, and multi system orchestration. ERPs become projections on the mesh, not the source of truth.</li>
</ul>
</section>
</section>


	<section class="mt-10 rounded-2xl border border-white/30 p-6 md:p-10">
		<h2 class="text-2xl font-semibold">Recent Activity</h2>
		<p class="mt-4 text-sm text-white-800/95">Recent system events, process updates, and governance actions will appear here.</p>
	</section>		


<style>
	.home-shell {
		background: linear-gradient(160deg, rgba(255, 255, 255, 0.8), rgba(219, 234, 254, 0.72));
		box-shadow: 0 22px 50px rgba(16, 37, 63, 0.25);
	}
</style>
