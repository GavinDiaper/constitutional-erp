<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<h2 class="text-2xl font-semibold">Admin Dashboard</h2>
<p class="muted mt-2 text-sm">Admin dashboards and inspectors for governance, events, and accounting drilldowns.</p>

<div class="mt-4 flex flex-wrap gap-2">
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/create-entities')}>Open Create Admin Entities</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/events')}>Open Event Stream Viewer</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/trial-balance')}>Open R2R Trial Balance</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/ledger-entries')}>Open R2R Ledger Entries</a>
</div>
