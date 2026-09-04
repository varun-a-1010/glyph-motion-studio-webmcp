/**
 * Trusted runtime: compiles a declarative TimelineDefinition into a paused
 * GSAP timeline. This is the ONLY place tween calls are made. Steps are
 * data; nothing in a step is ever evaluated as code.
 */
import gsap from './gsapEngine';
import { resolveTargetsSorted } from './targetResolver';
import type {
	ElementRegistry,
	StepTiming,
	TimelineDefinition,
	TimelineStep,
	TweenProperties
} from '$lib/types';

const META_PROPS: (keyof TweenProperties)[] = ['fromProps', 'drawSVG'];

interface DrawSVGMutation {
	element: SVGElement;
	origFill: string;
	origStroke: string;
	origStrokeWidth: string;
}

export interface TimelineBuildResult {
	timeline: gsap.core.Timeline;
	cleanup: () => void;
	skippedSteps: string[];
	failedSteps: { id: string; error: string }[];
	stepTimings: StepTiming[];
}

export function buildTimeline(
	definition: TimelineDefinition,
	registry: ElementRegistry,
	containerEl: HTMLElement
): TimelineBuildResult {
	const tl = gsap.timeline({
		paused: true,
		defaults: { ease: definition.defaults.ease, duration: definition.defaults.duration }
	});

	const drawMutations: DrawSVGMutation[] = [];
	const restoreTweens: gsap.core.Tween[] = [];
	const skippedSteps: string[] = [];
	const failedSteps: { id: string; error: string }[] = [];

	function cleanup() {
		for (const tween of restoreTweens) {
			try {
				tween.kill();
			} catch {
				/* already dead */
			}
		}
		restoreTweens.length = 0;
		for (const mut of drawMutations) {
			try {
				mut.element.setAttribute('fill', mut.origFill);
				mut.element.setAttribute('stroke', mut.origStroke);
				mut.element.setAttribute('stroke-width', mut.origStrokeWidth);
			} catch {
				/* removed from DOM */
			}
		}
		drawMutations.length = 0;
	}

	for (const step of definition.steps) {
		const sortBy = (typeof step.stagger === 'object' && step.stagger?.sortBy) || 'dom-order';
		const targets = resolveTargetsSorted(step.target, registry, containerEl, sortBy);

		if (targets.length === 0) {
			if (step.critical) {
				tl.kill();
				cleanup();
				return {
					timeline: gsap.timeline({ paused: true }),
					cleanup,
					skippedSteps: [...skippedSteps, step.id],
					failedSteps: [...failedSteps, { id: step.id, error: 'Critical step found no targets' }],
					stepTimings: []
				};
			}
			skippedSteps.push(step.id);
			continue;
		}

		try {
			const vars = buildVars(step);

			switch (step.tweenType) {
				case 'from':
					tl.from(targets, vars, step.position);
					break;
				case 'to':
					tl.to(targets, vars, step.position);
					break;
				case 'fromTo':
					tl.fromTo(targets, buildFromToStartVars(step), vars, step.position);
					break;
				case 'set':
					tl.set(targets, vars, step.position);
					break;
				case 'drawSVG': {
					const stepMutations: DrawSVGMutation[] = [];
					for (const t of targets) {
						const el = t as SVGElement;
						const stroke = el.getAttribute('stroke');
						const hasStroke = stroke && stroke !== 'none' && !stroke.startsWith('url(');
						if (!hasStroke) {
							const fill = el.getAttribute('fill') || '#ffffff';
							const fillColor = fill.startsWith('url(') ? '#ffffff' : fill;
							const mutation: DrawSVGMutation = {
								element: el,
								origFill: fill,
								origStroke: stroke || 'none',
								origStrokeWidth: el.getAttribute('stroke-width') || '0'
							};
							stepMutations.push(mutation);
							drawMutations.push(mutation);
							el.setAttribute('stroke', fillColor);
							el.setAttribute('stroke-width', '2');
							el.setAttribute('fill', 'none');
						}
					}

					// Opacity is set instantly at the draw start so a bare `from` doesn't fade the stroke out.
					const { opacity: drawOpacity, ...drawVars } = vars as Record<string, unknown>;
					if (drawOpacity !== undefined) {
						tl.set(targets, { opacity: drawOpacity as number }, step.position);
					}

					tl.from(
						targets,
						{
							drawSVG: step.props.drawSVG ?? '0%',
							...drawVars,
							onComplete() {
								for (const mut of stepMutations) {
									restoreTweens.push(
										gsap.to(mut.element, {
											duration: 0.4,
											ease: 'power2.out',
											attr: {
												fill: mut.origFill,
												stroke: mut.origStroke,
												'stroke-width': mut.origStrokeWidth
											}
										})
									);
								}
							}
						},
						step.position
					);
					break;
				}
			}
		} catch (err) {
			failedSteps.push({ id: step.id, error: err instanceof Error ? err.message : String(err) });
		}
	}

	// Real start times (even for relative positions like "<" or "+=0.2") for the track UI
	// and tool diagnostics. Each step's main tween carries `data.stepId`.
	const stepTimings: StepTiming[] = (tl.getChildren(false, true, false) as gsap.core.Tween[])
		.filter((t) => t.data && typeof t.data.stepId === 'string')
		.map((t) => ({
			stepId: t.data.stepId as string,
			start: t.startTime(),
			duration: t.totalDuration()
		}));

	return { timeline: tl, cleanup, skippedSteps, failedSteps, stepTimings };
}

/** Keep a fromTo transform on one pivot for its entire lifetime. */
export function buildFromToStartVars(step: TimelineStep): Record<string, unknown> {
	const from = { ...(step.props.fromProps ?? {}) } as Record<string, unknown>;
	for (const origin of ['transformOrigin', 'svgOrigin'] as const) {
		if (from[origin] === undefined && step.props[origin] !== undefined) {
			from[origin] = step.props[origin];
		}
	}
	return from;
}

function buildVars(step: TimelineStep): gsap.TweenVars {
	const vars: gsap.TweenVars = { duration: step.duration, data: { stepId: step.id } };
	if (step.ease) vars.ease = step.ease;
	if (step.stagger !== undefined) {
		if (typeof step.stagger === 'object') {
			const { sortBy: _sortBy, ...gsapStagger } = step.stagger;
			vars.stagger = gsapStagger;
		} else {
			vars.stagger = step.stagger;
		}
	}
	for (const [key, value] of Object.entries(step.props)) {
		if (!META_PROPS.includes(key as keyof TweenProperties) && value !== undefined) {
			(vars as Record<string, unknown>)[key] = value;
		}
	}
	return vars;
}
