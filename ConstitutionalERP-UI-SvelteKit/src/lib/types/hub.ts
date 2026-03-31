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
		properties?: Record<string, { type?: string; description?: string; enum?: string[] }>;
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
