const PUBLIC_EXACT_PATHS = new Set<string>(['/', '/documentation', '/documentation/content', '/auth/callback']);

const PUBLIC_PREFIX_PATHS = ['/documentation/content/'];

const PUBLIC_INTERNAL_PREFIXES = ['/_app/', '/@fs/', '/@id/'];

const PUBLIC_INTERNAL_EXACT = new Set<string>(['/favicon.ico', '/robots.txt', '/manifest.webmanifest']);

const PUBLIC_API_EXACT_PATHS = new Set<string>([]);

function normalizePathname(pathname: string): string {
	if (!pathname) {
		return '/';
	}

	if (pathname.length > 1 && pathname.endsWith('/')) {
		return pathname.slice(0, -1);
	}

	return pathname;
}

function stripDataSuffix(pathname: string): string {
	return pathname.endsWith('/__data.json') ? pathname.slice(0, -'/__data.json'.length) || '/' : pathname;
}

function isInternalPublicPath(pathname: string): boolean {
	if (PUBLIC_INTERNAL_EXACT.has(pathname)) {
		return true;
	}

	return PUBLIC_INTERNAL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isPublicPagePath(pathname: string): boolean {
	if (PUBLIC_EXACT_PATHS.has(pathname)) {
		return true;
	}

	return PUBLIC_PREFIX_PATHS.some((prefix) => pathname.startsWith(prefix));
}

function isPublicApiPath(pathname: string): boolean {
	return PUBLIC_API_EXACT_PATHS.has(pathname);
}

export function isPublicRequest(pathname: string, method: string): boolean {
	const normalizedPath = normalizePathname(pathname);
	const routePath = normalizePathname(stripDataSuffix(normalizedPath));
	const methodUpper = method.toUpperCase();

	if (methodUpper === 'OPTIONS') {
		return true;
	}

	if (isInternalPublicPath(routePath)) {
		return true;
	}

	if (routePath.startsWith('/api/')) {
		return isPublicApiPath(routePath);
	}

	return isPublicPagePath(routePath);
}

export const publicRouteManifest = {
	publicExactPaths: [...PUBLIC_EXACT_PATHS],
	publicPrefixPaths: [...PUBLIC_PREFIX_PATHS],
	publicApiExactPaths: [...PUBLIC_API_EXACT_PATHS]
};
