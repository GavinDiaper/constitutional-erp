<script lang="ts">
	import { resolve } from '$app/paths';

	type BreadcrumbItem = {
		label: string;
		href?: string;
	};

	export let items: BreadcrumbItem[] = [];
</script>

<nav class="rounded-xl border dark:border-white/30 border-slate-200 dark:bg-white/5 bg-white/80 p-3" aria-label="Breadcrumb">
	<div class="flex flex-wrap items-center gap-2 text-xs dark:text-slate-200 text-slate-700">
		{#each items as item, index (item.label)}
			{#if item.href}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="rounded px-2 py-1 font-semibold dark:hover:bg-white/10 hover:bg-slate-100" href={item.href}>{item.label}</a>
			{:else}
				<span class="rounded dark:bg-white/10 dark:text-white bg-slate-200/70 px-2 py-1 font-semibold text-slate-800">{item.label}</span>
			{/if}
			{#if index < items.length - 1}
				<span class="dark:text-slate-400 text-slate-400">/</span>
			{/if}
		{/each}
	</div>
	<div class="mt-2 flex flex-wrap gap-2 text-[11px]">
		<a class="rounded border dark:border-white/25 dark:text-slate-200 dark:hover:bg-white/10 border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100" href={resolve('/canvas')}>
			Canvas Home
		</a>
		<a class="rounded border dark:border-white/25 dark:text-slate-200 dark:hover:bg-white/10 border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100" href={resolve('/canvas/create')}>
			Create Entity
		</a>
		<a class="rounded border dark:border-white/25 dark:text-slate-200 dark:hover:bg-white/10 border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100" href={resolve('/navigator/sessions')}>
			Navigator Sessions
		</a>
	</div>
</nav>
