<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<nav class="glass-panel h-full p-4">
	<p class="mb-3 text-xs uppercase tracking-[0.2em] text-white/70">Navigation</p>
	<ul class="space-y-2 text-sm">
		<li><a class="block rounded px-3 py-2 text-white hover:bg-white/10" href={resolve('/')}>Home</a></li>
		<li><a class="block rounded px-3 py-2 text-white hover:bg-white/10" href={resolve('/dashboard')}>Dashboard</a></li>
		<li><a class="block rounded px-3 py-2 text-white hover:bg-white/10" href={resolve('/canvas')}>Canvas Home</a></li>
		<li>
			<a class="block rounded px-3 py-2 text-white hover:bg-white/10" href={resolve('/canvas/create')}>
				Create Entity
			</a>
		</li>
		<li><a class="block rounded px-3 py-2 text-white hover:bg-white/10" href={resolve('/navigator/sessions')}>Navigator</a></li>
		<li><a class="block rounded px-3 py-2 text-white hover:bg-white/10" href={resolve('/admin')}>Admin</a></li>
		<li>
			<a class="block rounded px-3 py-2 text-white hover:bg-white/10" href={resolve('/admin/create-entities')}>
				Create Admin Entities
			</a>
		</li>
	</ul>
</nav>
