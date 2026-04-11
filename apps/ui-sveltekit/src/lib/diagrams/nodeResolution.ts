export type DiagramNodeSpec = {
	id: string;
	labels: string[];
};

export function normalizeDiagramLabel(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

export function extractDiagramNodeSpecs(definition: string): DiagramNodeSpec[] {
	const seen: Record<string, true> = {};
	const result: DiagramNodeSpec[] = [];

	function add(id: string, label?: string) {
		if (!id) return;
		const labels = label && label !== id ? [id, label] : [id];

		if (Object.prototype.hasOwnProperty.call(seen, id)) {
			const existing = result.find((node) => node.id === id);
			if (existing) {
				for (const entry of labels) {
					if (!existing.labels.includes(entry)) existing.labels.push(entry);
				}
			}
			return;
		}

		seen[id] = true;
		result.push({ id, labels });
	}

	if (/\berDiagram\b/.test(definition)) {
		const lhsRe = /^ {4}([A-Za-z]\w+)[ \t]*[{|]/gm;
		let match: RegExpExecArray | null;
		while ((match = lhsRe.exec(definition)) !== null) add(match[1], match[1]);

		const rhsRe = /[|o<>{}]{1,4}\s+(\w+)\s*:/g;
		while ((match = rhsRe.exec(definition)) !== null) add(match[1], match[1]);
	} else {
		const squareRe = /\b([A-Za-z_]\w*)\s*\[([^\]]+)\]/g;
		let match: RegExpExecArray | null;
		while ((match = squareRe.exec(definition)) !== null) add(match[1], match[2].trim());

		const bareRe = /\b([A-Za-z_]\w*)\b(?=\s*-->|\s*:::|\s*$)/gm;
		while ((match = bareRe.exec(definition)) !== null) add(match[1], match[1]);
	}

	return result;
}

export function buildDiagramLabelMap(nodeSpecs: DiagramNodeSpec[]): Record<string, string> {
	const labelToId: Record<string, string> = {};
	for (const spec of nodeSpecs) {
		for (const label of spec.labels) {
			labelToId[normalizeDiagramLabel(label)] = spec.id;
		}
	}
	return labelToId;
}

function pushUnique(values: string[], value: string) {
	if (!values.includes(value)) {
		values.push(value);
	}
}

export function resolveDiagramNodeIdFromContent(
	content: string,
	labelToId: Record<string, string>
): string | null {
	const normalizedContent = normalizeDiagramLabel(content);
	if (!normalizedContent) return null;

	const exactId = labelToId[normalizedContent];
	if (exactId) {
		return exactId;
	}

	const exactTokenMatches: string[] = [];
	const tokens = normalizedContent.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? [];
	for (const token of tokens) {
		const matchedId = labelToId[token];
		if (matchedId) {
			pushUnique(exactTokenMatches, matchedId);
		}
	}

	if (exactTokenMatches.length === 1) {
		return exactTokenMatches[0];
	}

	const boundaryMatches: string[] = [];
	for (const [label, id] of Object.entries(labelToId)) {
		const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const boundaryPattern = new RegExp(`(^|[^A-Za-z0-9_])${escapedLabel}([^A-Za-z0-9_]|$)`);
		if (boundaryPattern.test(normalizedContent)) {
			pushUnique(boundaryMatches, id);
		}
	}

	if (boundaryMatches.length === 1) {
		return boundaryMatches[0];
	}

	return null;
}