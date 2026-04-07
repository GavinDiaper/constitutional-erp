<script lang="ts">
	import MermaidDiagram from '$lib/components/shared/MermaidDiagram.svelte';

	export let value: unknown;

	let showRaw = false;

	// Resolve to a plain object/array if possible
	let json: object | null = null;
	$: {
		if (typeof value === 'object' && value !== null) {
			json = value as object;
		} else if (typeof value === 'string') {
			try {
				const parsed: unknown = JSON.parse(value);
				json = typeof parsed === 'object' && parsed !== null ? (parsed as object) : null;
			} catch {
				json = null;
			}
		} else {
			json = null;
		}
	}

	/**
	 * Strip characters that Mermaid mindmap treats as shape syntax or that break
	 * its parser: ( ) [ ] { } " # and control characters / newlines.
	 * Also truncate to a reasonable display length.
	 */
	function sanitizeLabel(text: string): string {
		return text
			.replace(/[()[\]{}"#]/g, '')   // Mermaid shape/special chars
			.replace(/[\r\n\t]/g, ' ')      // flatten whitespace
			.replace(/\s{2,}/g, ' ')        // collapse runs of spaces
			.trim()
			.slice(0, 80);                  // cap length for readability
	}

	// Build Mermaid mindmap from arbitrary JSON
	function toMindmap(node: unknown, indent: number): string {
		let out = '';

		if (Array.isArray(node)) {
			node.forEach((item: unknown, i: number) => {
				const label = `item-${i}`;
				if (typeof item === 'object' && item !== null) {
					out += `${' '.repeat(indent)}${sanitizeLabel(label)}\n`;
					out += toMindmap(item, indent + 2);
				} else {
					out += `${' '.repeat(indent)}${sanitizeLabel(label)}: ${sanitizeLabel(String(item))}\n`;
				}
			});
			return out;
		}

		if (typeof node === 'object' && node !== null) {
			for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
				const safeKey = sanitizeLabel(key);
				if (typeof val === 'object' && val !== null) {
					out += `${' '.repeat(indent)}${safeKey}\n`;
					out += toMindmap(val, indent + 2);
				} else {
					out += `${' '.repeat(indent)}${safeKey}: ${sanitizeLabel(String(val ?? ''))}\n`;
				}
			}
		}

		return out;
	}

	$: mermaidSource = json
		? `mindmap\n  root\n${toMindmap(json, 4)}`
		: null;

	function formatRaw(v: unknown): string {
		if (v === null || v === undefined) return '';
		if (typeof v === 'object') {
			try { return JSON.stringify(v, null, 2); } catch { return String(v); }
		}
		return String(v);
	}
</script>

{#if mermaidSource}
	<div>
		<MermaidDiagram definition={mermaidSource} title="Field Detail" showFullscreenToggle={true} />
		<button
			type="button"
			class="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/40 hover:text-white/70 transition-colors"
			on:click={() => (showRaw = !showRaw)}
		>
			{showRaw ? 'Hide raw' : 'Show raw'}
		</button>
		{#if showRaw}
			<pre class="mt-1 max-h-48 overflow-auto rounded bg-white/5 p-2 text-[11px] leading-relaxed text-white/70">{formatRaw(value)}</pre>
		{/if}
	</div>
{:else}
	<span>{formatRaw(value)}</span>
{/if}
