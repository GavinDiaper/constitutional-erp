<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { CaiplDecisionOption } from '$lib/api/caipl';

	export let option: CaiplDecisionOption | null = null;
	export let loading = false;

	let values: Record<string, unknown> = {};

	$: if (!option) {
		values = {};
	}

	const dispatch = createEventDispatcher<{
		submit: { optionId: string; formInput: Record<string, unknown> };
	}>();

	function setValue(fieldId: string, value: unknown): void {
		values = {
			...values,
			[fieldId]: value
		};
	}

	function submit(): void {
		if (!option) {
			return;
		}
		dispatch('submit', {
			optionId: option.id,
			formInput: values
		});
	}
</script>

<section class="glass-panel p-4">
	<h2 class="text-lg font-semibold">Form Surface</h2>
	{#if !option}
		<p class="mt-3 text-sm ui-muted">Select a decision option to view required inputs.</p>
	{:else}
		<p class="mt-2 text-xs ui-muted">{option.description}</p>
		{#if option.collectionState}
			<div class="mt-3 rounded border border-white/10 bg-black/10 p-2 text-xs">
				<p class="font-semibold">Collection State</p>
				<p class="mt-1 ui-muted">
					Domain: {option.collectionState.domain.toUpperCase()} | Operation: {option.collectionState.operation}
				</p>
				<p class="mt-1 ui-muted">
					Resolved: {option.collectionState.resolvedFields.length}/{option.collectionState.requiredFields.length}
				</p>
				{#if option.collectionState.missingFields.length > 0}
					<p class="mt-1 text-amber-300">Missing required: {option.collectionState.missingFields.join(', ')}</p>
				{:else}
					<p class="mt-1 text-emerald-300">All required fields are complete.</p>
				{/if}
			</div>
		{/if}
		<div class="mt-3 space-y-3">
			{#if option.inputSchema.fields.length === 0}
				<p class="text-sm ui-muted">No form input required for this option.</p>
			{:else}
				{#each option.inputSchema.fields as field (field.id)}
					{@const slot = option.collectionState?.slots.find((item) => item.fieldId === field.id)}
					{@const currentValue = slot?.value}
					<label class="block text-xs">
						<span class="mb-1 block ui-muted">{field.label}</span>
						{#if field.type === 'enum' && field.options}
							<select
								class="input-base w-full"
								value={typeof currentValue === 'string' ? currentValue : ''}
								on:change={(event) => setValue(field.id, event.currentTarget.value)}
							>
								<option value="">Select...</option>
								{#each field.options as optionValue}
									<option value={String(optionValue)}>{String(optionValue)}</option>
								{/each}
							</select>
						{:else if field.type === 'number'}
							<input
								class="input-base w-full"
								type="number"
								value={typeof currentValue === 'number' ? currentValue : ''}
								on:input={(event) => setValue(field.id, Number(event.currentTarget.value))}
							/>
						{:else if field.type === 'date'}
							<input
								class="input-base w-full"
								type="date"
								value={typeof currentValue === 'string' ? currentValue : ''}
								on:input={(event) => setValue(field.id, event.currentTarget.value)}
							/>
						{:else}
							<input
								class="input-base w-full"
								type="text"
								value={typeof currentValue === 'string' ? currentValue : ''}
								on:input={(event) => setValue(field.id, event.currentTarget.value)}
							/>
						{/if}
					</label>
				{/each}
			{/if}
		</div>
		<button class="ui-soft-button mt-3 px-3 py-2 text-sm" type="button" disabled={loading} on:click={submit}>
			Submit Form + Confirm
		</button>
	{/if}
</section>
