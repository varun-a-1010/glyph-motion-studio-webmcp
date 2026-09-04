/**
 * Glyph Motion Studio — core types.
 *
 * The timeline contract (TimelineDefinition / TimelineStep / AnimationTarget)
 * is the safety and interoperability boundary of the whole app: the human
 * editor, the WebMCP tools, and the trusted GSAP runtime all speak this one
 * declarative shape. Nothing here is ever executed as code.
 */

// ─── Element registry (semantic handles) ─────────────────────

export type ElementRole = 'primary' | 'secondary' | 'accent' | 'utility';

export type PrimitiveType =
	'polygon' | 'circle' | 'rect' | 'path' | 'ellipse' | 'line' | 'polyline' | 'text' | 'group';

export interface ElementMetadata {
	role: ElementRole;
	/** Parent group id — a semantic grouping, not necessarily a DOM <g>. */
	group: string;
	primitiveType: PrimitiveType;
	/** Human-readable label surfaced to agents and the step editor. */
	label?: string;
	/** Optional SVG-coordinate pivot for believable articulated rotation. */
	pivot?: { x: number; y: number };
}

export interface ElementRegistry {
	[elementId: string]: ElementMetadata;
}

// ─── Timeline contract ───────────────────────────────────────

export interface TimelineDefinition {
	totalDuration: number;
	defaults: TimelineDefaults;
	steps: TimelineStep[];
}

export interface TimelineDefaults {
	ease: string;
	duration: number;
}

export interface TimelineStep {
	id: string;
	label?: string;
	target: AnimationTarget;
	tweenType: TweenType;
	props: TweenProperties;
	duration: number;
	/** Absolute seconds, or a bounded relative position: "<", ">", "+=0.2", "-=0.2". */
	position: number | string;
	ease?: string;
	stagger?: StaggerConfig | number;
	/** If true, an unresolved target aborts the whole timeline build. */
	critical?: boolean;
}

/** Public tween types. morphSVG / motionPath are intentionally not exposed. */
export type TweenType = 'from' | 'to' | 'fromTo' | 'set' | 'drawSVG';

export interface AnimationTarget {
	/** Public targets are semantic only — no raw CSS selectors. */
	type: 'id' | 'role' | 'group';
	value: string;
	/** Scope to one scene element's namespaced registry. */
	scopeToId?: string;
}

export interface TweenProperties {
	x?: number;
	y?: number;
	scale?: number;
	scaleX?: number;
	scaleY?: number;
	rotation?: number;
	skewX?: number;
	skewY?: number;
	transformOrigin?: string;
	svgOrigin?: string;
	opacity?: number;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	drawSVG?: string;
	/** Starting values for 'fromTo'. */
	fromProps?: Omit<TweenProperties, 'fromProps'>;
}

export interface StaggerConfig {
	amount: number;
	from?: 'start' | 'center' | 'end' | 'random' | number;
	ease?: string;
	sortBy?: 'dom-order' | 'x-position' | 'y-position' | 'distance-from-center';
}

// ─── Scene ───────────────────────────────────────────────────

export interface Scene {
	id: string;
	name: string;
	settings: SceneSettings;
	elements: SceneElement[];
	timeline: TimelineDefinition;
	duration: number;
	createdAt: string;
	updatedAt: string;
}

export interface SceneSettings {
	width: number;
	height: number;
	backgroundColor: string;
	fps: number;
}

export interface BaseSceneElement {
	id: string;
	name: string;
	position: { x: number; y: number };
	scale: number;
	rotation: number;
	opacity: number;
	order: number;
	visible: boolean;
	locked: boolean;
}

export interface SvgSceneElement extends BaseSceneElement {
	type: 'svg';
	/** Key into the bundled sample artwork library. */
	artworkKey: string;
}

export type VectorPrimitive =
	'circle' | 'rect' | 'ellipse' | 'line' | 'polygon' | 'polyline' | 'path' | 'text';

export interface VectorPoint {
	x: number;
	y: number;
}

export interface VectorNodeBase {
	id: string;
	name: string;
	label: string;
	role: ElementRole;
	group: string;
	position: VectorPoint;
	scale: number;
	rotation: number;
	opacity: number;
	fill: string;
	stroke: string;
	strokeWidth: number;
	pivot?: VectorPoint;
}

export type VectorNode =
	| (VectorNodeBase & { primitive: 'circle'; cx: number; cy: number; radius: number })
	| (VectorNodeBase & {
			primitive: 'rect';
			x: number;
			y: number;
			width: number;
			height: number;
			rx: number;
			ry: number;
	  })
	| (VectorNodeBase & { primitive: 'ellipse'; cx: number; cy: number; rx: number; ry: number })
	| (VectorNodeBase & { primitive: 'line'; x1: number; y1: number; x2: number; y2: number })
	| (VectorNodeBase & { primitive: 'polygon' | 'polyline'; points: VectorPoint[] })
	| (VectorNodeBase & { primitive: 'path'; d: string })
	| (VectorNodeBase & {
			primitive: 'text';
			x: number;
			y: number;
			text: string;
			fontSize: number;
			fontWeight: number;
			textAnchor: 'start' | 'middle' | 'end';
	  });

/** A validated, markup-free vector layer authored through scene operations. */
export interface VectorSceneElement extends BaseSceneElement {
	type: 'vector';
	width: number;
	height: number;
	nodes: VectorNode[];
}

export type SceneElement = SvgSceneElement | VectorSceneElement;

export type RenderedElement = SceneElement & { renderedSvg?: string };

// ─── Artwork (bundled samples) ───────────────────────────────

export interface Artwork {
	key: string;
	name: string;
	description: string;
	/** Inner SVG markup with a viewBox; ids must match the registry. */
	svg: string;
	/** Intrinsic render size in scene pixels. */
	width: number;
	height: number;
	registry: ElementRegistry;
	backgroundColor: string;
}

// ─── Playback ────────────────────────────────────────────────

export interface PlaybackState {
	playing: boolean;
	currentTime: number;
	totalDuration: number;
	progress: number;
	playbackRate: number;
}

// ─── Diagnostics (shared by the renderer, the UI, and the tools) ──

export interface StepTiming {
	stepId: string;
	start: number;
	duration: number;
}

export interface BuildDiagnostics {
	/** Content hash of the timeline that was built. */
	hash: string;
	totalDuration: number;
	skippedSteps: string[];
	failedSteps: { id: string; error: string }[];
	stepTimings: StepTiming[];
}
