/**
 * Resolves a semantic AnimationTarget to DOM elements via the registry.
 * Public targets are id / role / group only — there is deliberately no
 * selector branch in this runtime.
 */
import type { AnimationTarget, ElementRegistry } from '$lib/types';

export type SortStrategy = 'dom-order' | 'x-position' | 'y-position' | 'distance-from-center';

/** Registry-only resolution (no DOM). Used for validation and diagnostics. */
export function resolveTargetIds(target: AnimationTarget, registry: ElementRegistry): string[] {
	const prefix = target.scopeToId ? `${target.scopeToId}__` : '';

	switch (target.type) {
		case 'id': {
			const fullId =
				prefix && !target.value.startsWith(prefix) ? `${prefix}${target.value}` : target.value;
			return registry[fullId] ? [fullId] : [];
		}
		case 'role':
			return Object.entries(registry)
				.filter(([id, meta]) => meta.role === target.value && (!prefix || id.startsWith(prefix)))
				.map(([id]) => id);
		case 'group': {
			const group =
				prefix && !target.value.startsWith(prefix) ? `${prefix}${target.value}` : target.value;
			return Object.entries(registry)
				.filter(([, meta]) => meta.group === group)
				.map(([id]) => id);
		}
		default:
			return [];
	}
}

export function resolveTargets(
	target: AnimationTarget,
	registry: ElementRegistry,
	container: HTMLElement
): Element[] {
	return resolveTargetIds(target, registry)
		.map((id) => container.querySelector(`#${CSS.escape(id)}`))
		.filter((el): el is Element => el !== null);
}

/**
 * Resolves then sorts spatially so GSAP's stagger `from: 'center'` means the
 * spatial centre rather than the middle array index.
 */
export function resolveTargetsSorted(
	target: AnimationTarget,
	registry: ElementRegistry,
	container: HTMLElement,
	sortBy: SortStrategy = 'dom-order'
): Element[] {
	const elements = resolveTargets(target, registry, container);
	if (sortBy === 'dom-order' || elements.length <= 1) return elements;

	const withBounds = elements.map((el) => {
		const bbox = (el as SVGGraphicsElement).getBBox?.();
		const cx = bbox ? bbox.x + bbox.width / 2 : 0;
		const cy = bbox ? bbox.y + bbox.height / 2 : 0;
		return { el, cx, cy };
	});

	// "Center" means the centroid of the target set itself, so "inward" is meaningful
	// for a ring of accents around a symbol regardless of where the artwork sits.
	const svgCx = withBounds.reduce((s, b) => s + b.cx, 0) / withBounds.length;
	const svgCy = withBounds.reduce((s, b) => s + b.cy, 0) / withBounds.length;

	switch (sortBy) {
		case 'x-position':
			withBounds.sort((a, b) => a.cx - b.cx);
			break;
		case 'y-position':
			withBounds.sort((a, b) => a.cy - b.cy);
			break;
		case 'distance-from-center':
			withBounds.sort(
				(a, b) => Math.hypot(a.cx - svgCx, a.cy - svgCy) - Math.hypot(b.cx - svgCx, b.cy - svgCy)
			);
			break;
	}

	return withBounds.map((wb) => wb.el);
}
