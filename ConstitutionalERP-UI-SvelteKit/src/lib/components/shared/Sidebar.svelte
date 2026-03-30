<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<nav class="glass-panel h-full p-4">
	<p class="mb-3 text-xs uppercase tracking-[0.2em] text-white/70">Navigation</p>
	<ul class="space-y-2 text-sm">
		<li><a class="block rounded px-3 py-2 hover:bg-white/10" href={resolve('/')}>Dashboard</a></li>
		<li><a class="block rounded px-3 py-2 hover:bg-white/10" href={resolve('/canvas')}>Canvas Home</a></li>
		<li>
			<a class="block rounded px-3 py-2 hover:bg-white/10" href={resolve('/canvas/o2c_quote/Q-1001')}>
				Sample Entity
			</a>
		</li>
		<li><a class="block rounded px-3 py-2 hover:bg-white/10" href={resolve('/navigator/sessions')}>Navigator</a></li>
		<li><a class="block rounded px-3 py-2 hover:bg-white/10" href={resolve('/admin')}>Admin</a></li>
	</ul>
</nav>
