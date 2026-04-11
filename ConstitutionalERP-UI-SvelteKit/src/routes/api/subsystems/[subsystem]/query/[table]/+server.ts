import { error } from '@sveltejs/kit';
import { proxySubsystemGet, type SubsystemKey } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

const supportedSubsystems: SubsystemKey[] = [
	'authority-engine',
	'governance-engine',
	'event-processor',
	'mesh-gateway',
	'process-graph',
	'navigator-ai'
];

export const GET: RequestHandler = async ({ params, request, url }) => {
	const subsystem = params.subsystem as SubsystemKey;
	if (!supportedSubsystems.includes(subsystem)) {
		throw error(404, `Unknown subsystem '${params.subsystem}'`);
	}

	const suffix = url.search ? `${url.search}` : '';
	return proxySubsystemGet(subsystem, `/query/${params.table}${suffix}`, request.headers);
};
