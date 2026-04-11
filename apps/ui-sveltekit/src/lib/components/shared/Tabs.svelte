<script lang="ts">
	export let tabs: string[] = [];
	export let selected = '';
	export let onSelect: (tab: string) => void = () => undefined;
</script>

<div class="flex flex-wrap gap-2">
	{#each tabs as tab (tab)}
		<button
			type="button"
			class={`rounded-md px-3 py-2 text-sm ${selected === tab ? 'dark:bg-white dark:text-slate-900 bg-slate-900 text-white' : 'dark:bg-white/10 bg-slate-500/10'}`}
			on:click={() => onSelect(tab)}
		>
			{tab}
		</button>
	{/each}
</div>
