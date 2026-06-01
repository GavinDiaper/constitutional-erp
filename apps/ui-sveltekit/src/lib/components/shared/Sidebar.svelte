<script lang="ts">
import { resolve } from '$app/paths';
import { env as publicEnv } from '$env/dynamic/public';

const caiplEnabled = (publicEnv.PUBLIC_CAILP_ENABLED ?? '').toLowerCase() === 'true';
const linaEnabled = (publicEnv.PUBLIC_LINA_ENABLED ?? '').toLowerCase() === 'true';

type MenuGroupKey = 'home' | 'canvas' | 'ai' | 'admin';

let expandedGroups: Record<MenuGroupKey, boolean> = {
	home: false,
	canvas: false,
	ai: false,
	admin: false
};

function toggleGroup(group: MenuGroupKey): void {
	expandedGroups = {
		...expandedGroups,
		[group]: !expandedGroups[group]
	};
}

function groupToggleLabel(group: MenuGroupKey, label: string): string {
	return `${expandedGroups[group] ? 'Collapse' : 'Expand'} ${label} section`;
}
</script>

<nav class="glass-panel h-full p-4">
<p class="mb-3 text-xs uppercase tracking-[0.2em] opacity-70">Navigation</p>
<ul class="space-y-2 text-sm">
<li class="rounded border dark:border-white/15 border-slate-300/70">
<button
	type="button"
	class="flex w-full items-center justify-between rounded px-3 py-2 text-left dark:hover:bg-white/10 hover:bg-slate-500/10"
	on:click={() => toggleGroup('home')}
	aria-expanded={expandedGroups.home}
	aria-label={groupToggleLabel('home', 'Home')}
>
	<span>Home</span>
	<span class="text-xs opacity-70">{expandedGroups.home ? '−' : '+'}</span>
</button>
	{#if expandedGroups.home}
	<ul class="space-y-1 pb-2">
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/')}>Home</a></li>
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/dashboard')}>Dashboard</a></li>
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/documentation')}>Documentation</a></li>
	</ul>
	{/if}
</li>

<li class="rounded border dark:border-white/15 border-slate-300/70">
<button
	type="button"
	class="flex w-full items-center justify-between rounded px-3 py-2 text-left dark:hover:bg-white/10 hover:bg-slate-500/10"
	on:click={() => toggleGroup('canvas')}
	aria-expanded={expandedGroups.canvas}
	aria-label={groupToggleLabel('canvas', 'Canvas')}
>
	<span>Canvas</span>
	<span class="text-xs opacity-70">{expandedGroups.canvas ? '−' : '+'}</span>
</button>
	{#if expandedGroups.canvas}
	<ul class="space-y-1 pb-2">
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/canvas')}>Canvas Home</a></li>
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/projects')}>Projects</a></li>
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/inventory')}>Inventory</a></li>
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/canvas/create')}>Create Entity</a></li>
	</ul>
	{/if}
</li>

<li class="rounded border dark:border-white/15 border-slate-300/70">
<button
	type="button"
	class="flex w-full items-center justify-between rounded px-3 py-2 text-left dark:hover:bg-white/10 hover:bg-slate-500/10"
	on:click={() => toggleGroup('ai')}
	aria-expanded={expandedGroups.ai}
	aria-label={groupToggleLabel('ai', 'AI')}
>
	<span>AI</span>
	<span class="text-xs opacity-70">{expandedGroups.ai ? '−' : '+'}</span>
</button>
	{#if expandedGroups.ai}
	<ul class="space-y-1 pb-2">
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/navigator')}>Navigator AI</a></li>
		{#if caiplEnabled}
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/ai/workspace')}>CAILP Workspace</a></li>
		{/if}
		{#if linaEnabled}
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/lina/workspace')}>Lina Workspace</a></li>
		{/if}
	</ul>
	{/if}
</li>

<li class="rounded border dark:border-white/15 border-slate-300/70">
<button
	type="button"
	class="flex w-full items-center justify-between rounded px-3 py-2 text-left dark:hover:bg-white/10 hover:bg-slate-500/10"
	on:click={() => toggleGroup('admin')}
	aria-expanded={expandedGroups.admin}
	aria-label={groupToggleLabel('admin', 'Admin')}
>
	<span>Admin</span>
	<span class="text-xs opacity-70">{expandedGroups.admin ? '−' : '+'}</span>
</button>
	{#if expandedGroups.admin}
	<ul class="space-y-1 pb-2">
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/admin')}>Admin Home</a></li>
		<li><a class="block rounded px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/admin/erp-mappings')}>ERP Mappings</a></li>
	</ul>
	{/if}
</li>
</ul>
</nav>
