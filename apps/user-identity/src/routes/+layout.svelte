<style>
	:global(body) {
		margin: 0;
		font-family: "Public Sans", "Segoe UI", sans-serif;
		background: radial-gradient(circle at top left, #eef6ff 0%, #f8fbff 45%, #ffffff 100%);
		color: #0f172a;
	}

	main {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 2rem 1rem;
	}
</style>

<main>
	<slot />
</main>
