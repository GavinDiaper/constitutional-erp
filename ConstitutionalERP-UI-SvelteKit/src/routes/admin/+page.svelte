<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<h2 class="text-2xl font-semibold">Admin Dashboard</h2>
<p class="muted mt-2 text-sm">Admin dashboards and inspectors are scaffolded for phase-2 implementation.</p>

<div class="mt-4">
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/create-entities')}>
		Open Create Admin Entities
	</a>
</div>
