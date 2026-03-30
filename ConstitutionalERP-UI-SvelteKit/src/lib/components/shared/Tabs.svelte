<script lang="ts">
	export let tabs: string[] = [];
	export let selected = '';
	export let onSelect: (tab: string) => void = () => undefined;
</script>

<div class="flex flex-wrap gap-2">
	{#each tabs as tab (tab)}
		<button
			type="button"
			class={`rounded-md px-3 py-2 text-sm ${selected === tab ? 'bg-white text-slate-900' : 'bg-white/10'}`}
			on:click={() => onSelect(tab)}
		>
			{tab}
		</button>
	{/each}
</div>
