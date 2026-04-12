import adapter from '@sveltejs/adapter-node';

function parseTrustedOrigins(raw) {
	if (!raw) {
		return [];
	}

	return raw
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

const csrfTrustedOrigins = parseTrustedOrigins(
	process.env.UI_CSRF_TRUSTED_ORIGINS ??
		'http://localhost:4174,http://127.0.0.1:4174'
);

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: false
	},
	kit: {
		adapter: adapter(),
		csrf: {
			trustedOrigins: csrfTrustedOrigins
		}
	}
};

export default config;
