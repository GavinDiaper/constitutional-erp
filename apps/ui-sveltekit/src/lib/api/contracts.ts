import { fetchHubJson, postHubJson } from '$lib/api/hub';
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

export function getActiveContracts(actor: ActorContext, customerId: string): Promise<ContractOptionsResponse> {
	const query = new URLSearchParams({ customerId });
	return fetchHubJson<ContractOptionsResponse>(`/api/hub/o2c/contracts/active?${query.toString()}`, actor);
}

export interface ContractVersion {
	contract_version_id: string;
	contract_id: string;
	version_number: number;
	status: 'Draft' | 'Approved' | 'Superseded' | string;
	contract_value: number;
	currency_code: string;
	effective_from: string;
	effective_until: string | null;
	sow_snapshot: string | null;
	created_by?: string;
	created_at?: string;
	approved_by?: string | null;
	approved_at?: string | null;
	approval_governance?: { riskLevel: 'Low' | 'Medium' | 'High'; requiredTier: number; governanceTag: string };
}

export interface Contract {
	contract_id: string;
	customer_id: string;
	external_reference: string | null;
	name: string;
	status: 'Draft' | 'Active' | string;
	current_version: number | null;
	created_by?: string;
	created_at?: string;
	updated_at?: string;
}

export interface ContractDetail extends Contract {
	versions: ContractVersion[];
}

export interface ContractVersionInput {
	contractValue: number;
	currencyCode: string;
	effectiveFrom: string;
	effectiveUntil?: string;
	sowSnapshot?: Record<string, unknown>;
}

export interface CreateContractInput {
	customerId: string;
	externalReference?: string;
	name: string;
	version: ContractVersionInput;
}

export function listContracts(actor: ActorContext, customerId?: string): Promise<{ data: Contract[] }> {
	const query = customerId ? `?${new URLSearchParams({ customerId }).toString()}` : '';
	return fetchHubJson(`/api/hub/o2c/contracts${query}`, actor);
}

export function getContract(actor: ActorContext, contractId: string): Promise<{ data: ContractDetail }> {
	return fetchHubJson(`/api/hub/o2c/contracts/${encodeURIComponent(contractId)}`, actor);
}

export function createContract(actor: ActorContext, input: CreateContractInput): Promise<{ data: ContractVersion }> {
	return postHubJson('/api/hub/o2c/contracts', actor, input);
}

export function approveContractVersion(
	actor: ActorContext,
	contractId: string,
	versionNumber: number
): Promise<{ data: ContractVersion }> {
	return postHubJson(
		`/api/hub/o2c/contracts/${encodeURIComponent(contractId)}/versions/${versionNumber}/approve`,
		actor,
		{}
	);
}

export function createContractAmendment(
	actor: ActorContext,
	contractId: string,
	input: ContractVersionInput
): Promise<{ data: ContractVersion }> {
	return postHubJson(`/api/hub/o2c/contracts/${encodeURIComponent(contractId)}/amendments`, actor, input);
}
