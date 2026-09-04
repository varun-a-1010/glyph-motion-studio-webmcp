/**
 * Prefixes all ids in an SVG string and its registry so multiple artwork
 * instances can share one canvas. Negative lookahead makes it idempotent.
 */
import type { ElementRegistry } from '$lib/types';

export const NS_SEPARATOR = '__';

export function namespaceArtwork(
	svg: string,
	registry: ElementRegistry,
	prefix: string
): { svg: string; registry: ElementRegistry } {
	const fullPrefix = `${prefix}${NS_SEPARATOR}`;
	const escaped = fullPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	const namespacedRegistry: ElementRegistry = {};
	for (const [id, meta] of Object.entries(registry)) {
		const newId = id.startsWith(fullPrefix) ? id : `${fullPrefix}${id}`;
		namespacedRegistry[newId] = {
			...meta,
			group:
				meta.group && !meta.group.startsWith(fullPrefix) ? `${fullPrefix}${meta.group}` : meta.group
		};
	}

	const namespacedSvg = svg
		.replace(new RegExp(`id="(?!${escaped})([^"]+)"`, 'g'), `id="${fullPrefix}$1"`)
		.replace(new RegExp(`href="#(?!${escaped})([^"]+)"`, 'g'), `href="#${fullPrefix}$1"`)
		.replace(new RegExp(`url\\(#(?!${escaped})([^)]+)\\)`, 'g'), `url(#${fullPrefix}$1)`)
		.replace(
			new RegExp(`xlink:href="#(?!${escaped})([^"]+)"`, 'g'),
			`xlink:href="#${fullPrefix}$1"`
		);

	return { svg: namespacedSvg, registry: namespacedRegistry };
}

/** "uuid__symbol" → { scope: "uuid", local: "symbol" } */
export function splitNamespacedId(id: string): { scope: string | null; local: string } {
	const idx = id.indexOf(NS_SEPARATOR);
	if (idx <= 0) return { scope: null, local: id };
	return { scope: id.slice(0, idx), local: id.slice(idx + NS_SEPARATOR.length) };
}
