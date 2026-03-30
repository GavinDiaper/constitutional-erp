<script lang="ts">
	import { page } from '$app/stores';

	$: sessionId = $page.params.sessionId;
</script>

<section class="glass-panel p-6">
	<h2 class="text-2xl font-semibold">Session {sessionId}</h2>
	<p class="muted mt-2 text-sm">Navlog and transcript detail are planned for phase 2.</p>
</section>
