<script lang="ts">
	export let riskLevel = 'Low';
	export let requiredTier = 1;

	$: tone =
		riskLevel.toLowerCase() === 'high'
			? 'bg-red-600'
			: riskLevel.toLowerCase() === 'medium'
				? 'bg-amber-500 text-slate-900'
				: 'bg-emerald-500 text-slate-900';
</script>

<span class={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
	{riskLevel} Risk (Tier {requiredTier})
</span>
