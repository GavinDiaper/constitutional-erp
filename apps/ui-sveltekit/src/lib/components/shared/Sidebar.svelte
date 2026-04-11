<script lang="ts">
import { resolve } from '$app/paths';
</script>

<nav class="glass-panel h-full p-4">
<p class="mb-3 text-xs uppercase tracking-[0.2em] opacity-70">Navigation</p>
<ul class="space-y-2 text-sm">
<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/')}>Home</a></li>
<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/dashboard')}>Dashboard</a></li>
<!-- <li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/diagrams')}>Diagram Explorer</a></li> -->
<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/documentation')}>Documentation</a></li>
<!-- <li>
<a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/diagrams/process-flows')}>
Domain Process Flows
</a>
</li> -->
<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/canvas')}>Canvas Home</a></li>
<li>
<a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/canvas/create')}>
Create Entity
</a>
</li>
<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/navigator')}>Navigator AI</a></li>
<li>
<a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/admin')}>Admin</a>
<!-- <ul class="mt-1 space-y-1 pl-4 text-xs">
<li>
<a class="block rounded px-3 py-2 text-white/90 hover:bg-white/10" href={resolve('/navigator/sessions')}>
Navigator Sessions
</a>
</li>
</ul> -->
</li>
</ul>
</nav>
