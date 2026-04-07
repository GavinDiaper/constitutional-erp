<script lang="ts">
	import { resolve } from '$app/paths';

	type BreadcrumbItem = {
		label: string;
		href?: string;
	};

	export let items: BreadcrumbItem[] = [];
</script>

<nav class="rounded-xl border border-white/30 bg-white/75 p-3" aria-label="Breadcrumb">
	<div class="flex flex-wrap items-center gap-2 text-xs text-slate-700">
		{#each items as item, index (item.label)}
			{#if item.href}
				<a class="rounded px-2 py-1 font-semibold hover:bg-slate-100" href={item.href}>{item.label}</a>
			{:else}
				<span class="rounded bg-slate-200/70 px-2 py-1 font-semibold text-slate-800">{item.label}</span>
			{/if}
			{#if index < items.length - 1}
				<span class="text-slate-400">/</span>
			{/if}
		{/each}
	</div>
	<div class="mt-2 flex flex-wrap gap-2 text-[11px]">
		<a class="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100" href={resolve('/canvas')}>
			Canvas Home
		</a>
		<a class="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100" href={resolve('/canvas/create')}>
			Create Entity
		</a>
		<a class="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100" href={resolve('/navigator/sessions')}>
			Navigator Sessions
		</a>
	</div>
</nav>
