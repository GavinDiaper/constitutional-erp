<script lang="ts">
	import { linaDevConsoleEntries, clearLinaConsoleEntries } from '$lib/stores/linaDevConsole';

	export let visible = false;
</script>

{#if visible}
	<section class="glass-panel p-4">
		<div class="flex items-center justify-between gap-2">
			<h2 class="text-lg font-semibold">Developer Console</h2>
			<button class="btn-ghost rounded px-2 py-1 text-xs" type="button" on:click={clearLinaConsoleEntries}>Clear</button>
		</div>
		<div class="mt-3 max-h-[220px] space-y-2 overflow-auto">
			{#if $linaDevConsoleEntries.length === 0}
				<p class="text-sm ui-muted">No entries yet.</p>
			{:else}
				{#each $linaDevConsoleEntries as entry (entry.id)}
					<article class="section-card p-2 text-xs">
						<p class="font-semibold">[{entry.level.toUpperCase()}] {entry.scope}</p>
						<p class="ui-muted mt-1">{entry.message}</p>
						<p class="ui-muted mt-1">{new Date(entry.timestamp).toLocaleTimeString()}</p>
						{#if entry.payload}
							<pre class="mt-1 overflow-auto whitespace-pre-wrap break-words ui-muted">{JSON.stringify(entry.payload, null, 2)}</pre>
						{/if}
					</article>
				{/each}
			{/if}
		</div>
	</section>
{/if}
