import { getArtwork } from '$lib/samples';
import type { ElementRegistry, RenderedElement, SceneElement } from '$lib/types';
import { namespaceArtwork } from './namespacing';
import { renderVectorElement } from './vectorRenderer';

export interface AssembledSceneElement {
	element: RenderedElement;
	registry: ElementRegistry;
}

/** Resolve a bundled or agent-authored layer through one namespacing path. */
export function assembleSceneElement(element: SceneElement): AssembledSceneElement | null {
	const source =
		element.type === 'svg'
			? (() => {
					const artwork = getArtwork(element.artworkKey);
					return artwork ? { svg: artwork.svg, registry: artwork.registry } : null;
				})()
			: renderVectorElement(element);
	if (!source) return null;
	const namespaced = namespaceArtwork(source.svg, source.registry, element.id);
	return {
		element: { ...element, renderedSvg: namespaced.svg },
		registry: namespaced.registry
	};
}

export function buildSceneRegistry(elements: SceneElement[]): ElementRegistry {
	const combined: ElementRegistry = {};
	for (const element of elements) {
		const assembled = assembleSceneElement(element);
		if (assembled) Object.assign(combined, assembled.registry);
	}
	return combined;
}
