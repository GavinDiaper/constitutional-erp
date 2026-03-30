<script lang="ts">
	export let text: string;
	export let tone: 'neutral' | 'danger' = 'neutral';
</script>

<span
	class={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${tone === 'danger' ? 'bg-red-600 text-white' : 'bg-white/15 text-white'}`}
>
	{text}
</span>
