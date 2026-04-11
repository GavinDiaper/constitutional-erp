export interface HubActionLink {
	href: string;
	method?: string;
	mcpFunction?: string;
	governance?: {
		riskLevel?: 'Low' | 'Medium' | 'High' | string;
		requiredTier?: number;
	};
	inputSchema?: {
		required?: string[];
    properties?: Record<string, { type?: string; description?: string; enum?: string[]; 'x-lookup'?: string }>;
	};
}

export interface ProcessResponse {
	entityType: string;
	entityId: string;
	state: string;
	attributes: Record<string, unknown>;
	_links: Record<string, HubActionLink>;
}

export interface TimelineEvent {
	id: string;
	timestamp: string;
	category: string;
	message: string;
	severity?: 'low' | 'medium' | 'high';
}

export interface ProcessGraphEdge {
	from: string;
	to: string;
	risk: 'low' | 'medium' | 'high';
	label?: string;
}

export interface ProcessGraphModel {
	currentState: string;
	nodes: string[];
	edges: ProcessGraphEdge[];
}

export interface McpFunctionSummary {
	id: string;
	entity?: string;
	domain?: string;
	aggregateType?: string;
	action?: string;
	operationType?: 'create' | 'update' | 'transition' | 'query' | string;
	requiredInputs?: string[];
}

export interface EntityActionSankeyNode {
	id: string;
	label: string;
	level: 0 | 1 | 2 | 3;
}

export interface EntityActionSankeyLink {
	source: string;
	target: string;
	value: number;
	isAllowed?: boolean;
}

export interface EntityActionSankeyModel {
	nodes: EntityActionSankeyNode[];
	links: EntityActionSankeyLink[];
}

export type CanonicalFlowDomain = 'O2C' | 'P2P' | 'R2R' | 'H2R';

export interface ProcessFlowNode {
	id: string;
	sequence: number;
	requestName: string;
	httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
	requestPath: string;
	action: string;
	entityType: string;
	dependsOnVariables: string[];
	capturesVariables: string[];
}

export interface ProcessFlowEdge {
	sourceId: string;
	targetId: string;
	condition: string;
}

export interface ProcessFlowDefinition {
	id: string;
	name: string;
	domain: CanonicalFlowDomain;
	variantKey: string;
	variantLabel: string;
	sourceFolderName: string;
	nodes: ProcessFlowNode[];
	edges: ProcessFlowEdge[];
}

export interface ProcessFlowBundle {
	generatedAt: string;
	sourceCollectionPath: string;
	flows: ProcessFlowDefinition[];
	warnings: string[];
}
