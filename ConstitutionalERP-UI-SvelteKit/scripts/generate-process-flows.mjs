import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const FLOW_FOLDER_PATTERN = /^\s*\d+\s*-\s*(.+)$/;
const DOMAIN_PATTERN = /\b(O2C|P2P|R2R|H2R)\b/i;
const VARIABLE_PATTERN = /{{\s*([^}]+?)\s*}}/g;
const CAPTURE_PATTERN = /pm\.environment\.set\(\s*['"]([^'"]+)['"]/g;

function ensureArray(value) {
	return Array.isArray(value) ? value : [];
}

function sanitizeSlug(input) {
	return String(input)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function normalizeDomain(raw) {
	const match = raw.match(DOMAIN_PATTERN);
	if (!match) {
		return null;
	}

	return match[1].toUpperCase();
}

function deriveVariant(folderName) {
	if (/reverse\s*charge|\bRC\d+\b/i.test(folderName)) {
		return { key: 'rc5', label: 'UAE Reverse Charge (RC5)' };
	}

	if (/\bVAT\d+\b|\bUAE\b/i.test(folderName)) {
		return { key: 'vat5', label: 'UAE VAT (VAT5)' };
	}

	return { key: 'base', label: 'Base' };
}

function extractVariables(text) {
	if (!text) {
		return [];
	}

	const variables = new Set();
	for (const match of text.matchAll(VARIABLE_PATTERN)) {
		const variableName = match[1]?.trim();
		if (variableName) {
			variables.add(variableName);
		}
	}

	return Array.from(variables).sort((left, right) => left.localeCompare(right));
}

function extractCaptures(events) {
	const captures = new Set();
	for (const event of ensureArray(events)) {
		const lines = ensureArray(event?.script?.exec);
		for (const line of lines) {
			for (const match of String(line).matchAll(CAPTURE_PATTERN)) {
				const variableName = match[1]?.trim();
				if (variableName) {
					captures.add(variableName);
				}
			}
		}
	}

	return Array.from(captures).sort((left, right) => left.localeCompare(right));
}

function getRawBody(request) {
	if (request?.body?.mode !== 'raw') {
		return '';
	}

	return String(request.body.raw ?? '');
}

function getRawUrl(request) {
	const url = request?.url;
	if (!url) {
		return '';
	}

	if (typeof url === 'string') {
		return url;
	}

	if (typeof url.raw === 'string') {
		return url.raw;
	}

	const host = ensureArray(url.host).join('.');
	const path = ensureArray(url.path).join('/');
	if (!host && !path) {
		return '';
	}

	const protocol = typeof url.protocol === 'string' ? `${url.protocol}://` : '';
	return `${protocol}${host}${path ? `/${path}` : ''}`;
}

function normalizePathFromRawUrl(rawUrl) {
	if (!rawUrl) {
		return '/';
	}

	const withoutQuery = rawUrl.split('?')[0] ?? rawUrl;
	const baseUrlTokenRemoved = withoutQuery.replace(/^{{\s*baseUrl\s*}}/i, '');
	return baseUrlTokenRemoved || '/';
}

function deriveAction(requestPath, httpMethod) {
	const segments = requestPath.split('/').filter(Boolean);
	if (segments.length === 0) {
		return httpMethod.toLowerCase();
	}

	const tail = segments[segments.length - 1];
	if (/^{[^}]+}$/.test(tail) || /^{{[^}]+}}$/.test(tail)) {
		if (segments.length >= 2) {
			return `${httpMethod.toLowerCase()}-${segments[segments.length - 2]}`;
		}
		return httpMethod.toLowerCase();
	}

	return tail.toLowerCase();
}

function deriveEntityType(requestPath) {
	const segments = requestPath.split('/').filter(Boolean);
	const domainIndex = segments.findIndex((segment) => segment.toLowerCase() === 'o2c' || segment.toLowerCase() === 'p2p' || segment.toLowerCase() === 'r2r' || segment.toLowerCase() === 'h2r');
	const entitySegment = domainIndex >= 0 ? segments[domainIndex + 1] : segments[segments.length - 1] ?? 'entity';
	return String(entitySegment ?? 'entity').toLowerCase();
}

function flattenRequestItems(item, destination) {
	if (!item) {
		return;
	}

	if (item.request) {
		destination.push(item);
		return;
	}

	for (const nested of ensureArray(item.item)) {
		flattenRequestItems(nested, destination);
	}
}

function buildFlow(folderItem, warnings, knownVariables) {
	const folderName = String(folderItem?.name ?? '').trim();
	const domain = normalizeDomain(folderName);
	if (!domain) {
		warnings.push(`Skipped flow folder without canonical domain: ${folderName}`);
		return null;
	}

	const variant = deriveVariant(folderName);
	const requests = [];
	for (const child of ensureArray(folderItem.item)) {
		flattenRequestItems(child, requests);
	}

	if (requests.length === 0) {
		warnings.push(`Skipped empty flow folder: ${folderName}`);
		return null;
	}

	const flowSlug = sanitizeSlug(`${domain.toLowerCase()}-${variant.key}`);
	const nodes = [];
	const edges = [];
	const seenNodeIds = new Set();

	for (let index = 0; index < requests.length; index += 1) {
		const requestItem = requests[index];
		const requestName = String(requestItem?.name ?? `Step ${index + 1}`);
		const method = String(requestItem?.request?.method ?? 'GET').toUpperCase();
		const rawUrl = getRawUrl(requestItem.request);
		const requestPath = normalizePathFromRawUrl(rawUrl);
		const requestBody = getRawBody(requestItem.request);
		const dependsOnVariables = extractVariables(`${rawUrl}\n${requestBody}`);
		const capturesVariables = extractCaptures(requestItem.event);
		const action = deriveAction(requestPath, method);
		const entityType = deriveEntityType(requestPath);
		const nodeId = `${flowSlug}-${String(index + 1).padStart(2, '0')}-${sanitizeSlug(action || requestName)}`;

		if (seenNodeIds.has(nodeId)) {
			warnings.push(`Duplicate node id '${nodeId}' in ${folderName}; step ${index + 1}`);
		}
		seenNodeIds.add(nodeId);

		nodes.push({
			id: nodeId,
			sequence: index + 1,
			requestName,
			httpMethod: method,
			requestPath,
			action,
			entityType,
			dependsOnVariables,
			capturesVariables
		});

		if (index > 0) {
			edges.push({
				sourceId: nodes[index - 1].id,
				targetId: nodeId,
				condition: 'Previous step completed'
			});
		}
	}

	const captures = new Set(nodes.flatMap((node) => node.capturesVariables));
	const knownVariableSet = new Set(knownVariables);
	const systemVariables = new Set(['baseUrl', 'apiKey', 'ingressId']);
	for (const node of nodes) {
		for (const dependency of node.dependsOnVariables) {
			if (dependency.startsWith('$')) {
				continue;
			}
			if (!captures.has(dependency) && !knownVariableSet.has(dependency) && !systemVariables.has(dependency)) {
				warnings.push(`Flow '${folderName}' step '${node.requestName}' depends on unresolved variable '{{${dependency}}}'.`);
			}
		}
	}

	return {
		id: flowSlug,
		name: `${domain} End-to-End Flow`,
		domain,
		variantKey: variant.key,
		variantLabel: variant.label,
		sourceFolderName: folderName,
		nodes,
		edges
	};
}

function main() {
	const cwd = process.cwd();
	const fallbackCollectionPath = resolve(
		cwd,
		'..',
		'..',
		'..',
		'FoundationERP',
		'ConstitutionalERP-FoundationERP',
		'postman',
		'FoundationERP.postman_collection.json'
	);

	const inputCollectionPath = process.env.FLOW_COLLECTION_PATH
		? resolve(process.env.FLOW_COLLECTION_PATH)
		: fallbackCollectionPath;
	const inputEnvironmentPath = process.env.FLOW_ENVIRONMENT_PATH
		? resolve(process.env.FLOW_ENVIRONMENT_PATH)
		: resolve(
			cwd,
			'..',
			'..',
			'..',
			'FoundationERP',
			'ConstitutionalERP-FoundationERP',
			'postman',
			'FoundationERP.local.postman_environment.json'
		);
	const outputPath = resolve(cwd, 'src', 'lib', 'flows', 'generated', 'foundation-process-flows.json');

	const collection = JSON.parse(readFileSync(inputCollectionPath, 'utf8'));
	let knownVariables = [];
	try {
		const environment = JSON.parse(readFileSync(inputEnvironmentPath, 'utf8'));
		knownVariables = ensureArray(environment?.values)
			.map((entry) => String(entry?.key ?? '').trim())
			.filter(Boolean);
	} catch {
		// Ignore missing environment file and rely on captured variables + system variables.
	}
	const warnings = [];
	const flows = [];

	for (const item of ensureArray(collection?.item)) {
		const folderName = String(item?.name ?? '');
		if (!FLOW_FOLDER_PATTERN.test(folderName) || !/\bflow\b/i.test(folderName)) {
			continue;
		}

		const flow = buildFlow(item, warnings, knownVariables);
		if (flow) {
			flows.push(flow);
		}
	}

	flows.sort((left, right) => {
		if (left.domain === right.domain) {
			if (left.variantKey === right.variantKey) {
				return left.sourceFolderName.localeCompare(right.sourceFolderName);
			}
			if (left.variantKey === 'base') {
				return -1;
			}
			if (right.variantKey === 'base') {
				return 1;
			}
			return left.variantKey.localeCompare(right.variantKey);
		}
		return left.domain.localeCompare(right.domain);
	});

	const output = {
		generatedAt: new Date().toISOString(),
		sourceCollectionPath: inputCollectionPath,
		flows,
		warnings: warnings.sort((left, right) => left.localeCompare(right))
	};

	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

	console.log(`Generated ${flows.length} process flows at ${outputPath}`);
	if (warnings.length > 0) {
		console.warn(`Generated with ${warnings.length} warning(s).`);
	}
}

main();
