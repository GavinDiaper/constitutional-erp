<script lang="ts">
	import { base, resolve } from '$app/paths';

	const logoUrl = `${base}/images/Provisa.svg`;
	const frontPageBackgroundUrl = `${base}/images/backgroundFrontPage.png`;
	const gMarkUrl = `${base}/images/G.png`;
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
			<a class="inline-block" href={logoUrl} target="_blank" rel="noreferrer">
				<img class="h-16 w-auto md:h-20" src={logoUrl} alt="Provisa logo" />
			</a>

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

<style>
	.home-shell {
		background: linear-gradient(160deg, rgba(255, 255, 255, 0.8), rgba(219, 234, 254, 0.72));
		box-shadow: 0 22px 50px rgba(16, 37, 63, 0.25);
	}
</style>
