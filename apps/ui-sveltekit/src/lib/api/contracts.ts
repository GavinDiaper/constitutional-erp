import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export interface ContractOption {
	contractId: string;
	customerId: string;
	externalReference?: string;
	name: string;
	contractVersionId: string;
	versionNumber: number;
	contractValue: number;
	currencyCode: string;
}

export interface ContractOptionsResponse {
	data: ContractOption[];
}

export function getActiveContracts(actor: ActorContext): Promise<ContractOptionsResponse> {
	return fetchHubJson<ContractOptionsResponse>('/api/hub/o2c/contracts/active', actor);
}