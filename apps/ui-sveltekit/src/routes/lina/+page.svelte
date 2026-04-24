<script lang="ts">
	import { goto } from '$app/navigation';

	function openWorkspace(): void {
		void goto('/lina/workspace');
	}
</script>

<section class="page-shell">
	<div class="glass-panel p-6">
		<h1 class="text-2xl font-semibold">Lina Workspace</h1>
		<p class="muted mt-2 text-sm">
			Experimental option-first CAIPL UX with role and mode driven interaction.
		</p>
		<button class="ui-soft-button mt-4 px-4 py-2 text-sm" on:click={openWorkspace}>Open Lina</button>
	</div>
</section>
