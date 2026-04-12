<script lang="ts">
	import { page } from '$app/stores';

	const providers = [
		{ id: 'google', label: 'Sign in with Google' },
		{ id: 'microsoft', label: 'Sign in with Microsoft' },
		{ id: 'apple', label: 'Sign in with Apple' }
	];

	$: next = $page.url.searchParams.get('next') ?? '/dashboard';
</script>

<svelte:head>
	<title>User Identity | Constitutional ERP</title>
</svelte:head>

<section class="card">
	<p class="eyebrow">Constitutional ERP</p>
	<h1>Identity Sign In</h1>
	<p class="subhead">Choose your provider to continue.</p>

	<div class="actions">
		{#each providers as provider}
			<a class="action" href={`/login/${provider.id}?next=${encodeURIComponent(next)}`}>{provider.label}</a>
		{/each}
	</div>
</section>

<style>
	.card {
		width: min(560px, 100%);
		background: #ffffff;
		border: 1px solid #dbe6f5;
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 20px 40px -30px rgba(15, 23, 42, 0.45);
	}

	.eyebrow {
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 600;
		font-size: 0.8rem;
		color: #2563eb;
	}

	h1 {
		margin: 0.6rem 0;
		font-size: 2rem;
	}

	.subhead {
		margin: 0;
		color: #334155;
	}

	.actions {
		margin-top: 1.5rem;
		display: grid;
		gap: 0.75rem;
	}

	.action {
		display: block;
		text-align: center;
		text-decoration: none;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		background: #0f172a;
		color: #ffffff;
		font-weight: 600;
	}

	.action:hover {
		background: #1e293b;
	}
</style>
