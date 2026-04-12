<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let token = '';
	let refreshToken = '';
	let copied = false;

	onMount(() => {
		const params = $page.url.searchParams;
		token = params.get('token') ?? '';
		refreshToken = params.get('refresh_token') ?? '';
	});

	async function copyToken(): Promise<void> {
		if (!token) {
			return;
		}
		await navigator.clipboard.writeText(token);
		copied = true;
	}
</script>

<svelte:head>
	<title>Identity Callback | Constitutional ERP</title>
</svelte:head>

<section class="card">
	<h1>Sign-in Complete</h1>
	{#if token}
		<p class="ok">Access token received from user-identity service.</p>
		<p class="hint">This page is the handoff point for web and mobile clients.</p>
		<button type="button" on:click={copyToken}>{copied ? 'Copied' : 'Copy access token'}</button>
		<details>
			<summary>Token details</summary>
			<p><strong>Access token:</strong> {token.slice(0, 24)}...</p>
			{#if refreshToken}
				<p><strong>Refresh token:</strong> {refreshToken.slice(0, 24)}...</p>
			{/if}
		</details>
	{:else}
		<p class="error">No token was received. Restart sign-in from the identity homepage.</p>
		<a href="/">Back to sign in</a>
	{/if}
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

	h1 {
		margin-top: 0;
		margin-bottom: 0.8rem;
	}

	.ok {
		color: #166534;
		margin: 0;
	}

	.hint {
		color: #334155;
	}

	.error {
		color: #991b1b;
	}

	button {
		padding: 0.65rem 1rem;
		border-radius: 0.6rem;
		border: none;
		background: #0f172a;
		color: #fff;
		font-weight: 600;
		cursor: pointer;
	}

	button:hover {
		background: #1e293b;
	}

	details {
		margin-top: 1rem;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 0.6rem;
		padding: 0.75rem;
	}
</style>
