<script lang="ts">
	import { resolve } from '$app/paths';
	import DiagramBreadcrumb from '$lib/components/shared/DiagramBreadcrumb.svelte';
	import { documentationContentItems } from '$lib/content/catalog';
</script>

<DiagramBreadcrumb
	items={[
		{ label: 'Home', href: resolve('/') },
		{ label: 'Documentation', href: resolve('/documentation') },
		{ label: 'Content' }
	]}
/>

<section class="rounded-2xl border border-white/30 bg-white/80 p-6 md:p-10">
	<h1 class="text-3xl font-semibold text-slate-900">Documentation Content</h1>
	<p class="mt-3 max-w-3xl text-sm text-slate-700">
		Select a markdown file from the content directory.
	</p>
</section>

<section class="mt-6 rounded-2xl border border-white/30 bg-white/75 p-6 md:p-8">
	{#if documentationContentItems.length === 0}
		<div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
			No markdown files found. Add files under <span class="font-semibold">src/lib/content/markdown</span>.
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each documentationContentItems as item (item.slug)}
				<a
					class="rounded-lg border border-emerald-500/40 bg-emerald-50/70 p-4 transition hover:-translate-y-0.5 hover:shadow"
					href={resolve('/documentation/content/[slug]', { slug: item.slug })}
				>
					<p class="text-sm font-semibold text-slate-900">{item.title}</p>
					<p class="mt-2 text-xs text-slate-700">/{item.slug}</p>
				</a>
			{/each}
		</div>
	{/if}
</section>
