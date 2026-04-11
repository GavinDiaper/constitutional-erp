import flowBundle from './generated/foundation-process-flows.json';
import type { CanonicalFlowDomain, ProcessFlowBundle, ProcessFlowDefinition } from '$lib/types/hub';

const typedBundle = flowBundle as ProcessFlowBundle;

export function getProcessFlowBundle(): ProcessFlowBundle {
	return typedBundle;
}

export function listFlowsByDomain(domain: CanonicalFlowDomain): ProcessFlowDefinition[] {
	return typedBundle.flows.filter((flow) => flow.domain === domain);
}

export function getFlowVariant(domain: CanonicalFlowDomain, variantKey: string): ProcessFlowDefinition | undefined {
	return typedBundle.flows.find((flow) => flow.domain === domain && flow.variantKey === variantKey);
}

export function getDefaultFlowForDomain(domain: CanonicalFlowDomain): ProcessFlowDefinition | undefined {
	const variants = listFlowsByDomain(domain);
	return variants.find((flow) => flow.variantKey === 'base') ?? variants[0];
}
