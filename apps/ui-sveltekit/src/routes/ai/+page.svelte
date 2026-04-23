<script lang="ts">
	import { goto } from '$app/navigation';

	function openWorkspace(): void {
		void goto('/ai/workspace');
	}
</script>

<section class="page-shell">
	<div class="glass-panel p-6">
		<h1 class="text-2xl font-semibold">AI Workspace</h1>
		<p class="muted mt-2 text-sm">
			CAIPL route entry point. Start a session in the workspace to plan and execute with governance controls.
		</p>
		<button class="ui-soft-button mt-4 px-4 py-2 text-sm" on:click={openWorkspace}>Open Workspace</button>
	</div>
</section>
