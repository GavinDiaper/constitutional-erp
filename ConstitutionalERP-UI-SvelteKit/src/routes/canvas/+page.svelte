<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<section class="glass-panel p-6">
	<h2 class="text-2xl font-semibold">Canvas Landing</h2>
	<p class="muted mt-2 text-sm">
		Select an entity route to inspect state transitions, governance constraints, and event activity.
	</p>

	<div class="mt-5 flex flex-wrap gap-3 text-sm">
		<a class="rounded-md bg-white px-4 py-2 font-semibold text-slate-900" href={resolve('/canvas/o2c_quote/Q-1001')}>
			Open O2C Quote
		</a>
		<a class="rounded-md border border-white/30 px-4 py-2" href={resolve('/canvas/p2p_requisition/REQ-2001')}>
			Open P2P Requisition
		</a>
	</div>
</section>
