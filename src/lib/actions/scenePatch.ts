/** Pure, validated vector-scene patching. No DOM and no generated markup. */
import { getArtwork } from '$lib/samples';
import { buildSceneRegistry } from '$lib/studio/sceneAssembly';
import { resolveTargetIds } from '$lib/studio/targetResolver';
import type {
	ElementRole,
	Scene,
	SceneElement,
	SvgSceneElement,
	VectorNode,
	VectorPoint,
	VectorPrimitive,
	VectorSceneElement
} from '$lib/types';
import { StudioError } from './errors';
import { ALLOWED_ROLES, assertNoScriptable, COLOR_RE, ID_RE, LIMITS } from './schema';

export type ScenePatchOperation =
	| { op: 'add_vector_layer'; element: VectorSceneElement }
	| { op: 'add_asset'; element: SvgSceneElement }
	| { op: 'add_node'; elementId: string; node: VectorNode }
	| {
			op: 'update_node';
			elementId: string;
			nodeId: string;
			changes: Partial<VectorNode>;
	  }
	| {
			op: 'duplicate_node';
			elementId: string;
			nodeId: string;
			newId: string;
			name?: string;
			label?: string;
			offset: VectorPoint;
	  }
	| { op: 'remove_node'; elementId: string; nodeId: string }
	| {
			op: 'set_semantics';
			elementId: string;
			nodeIds: string[];
			role?: ElementRole;
			group?: string;
	  }
	| {
			op: 'update_element';
			elementId: string;
			changes: Partial<Omit<SceneElement, 'id' | 'type' | 'artworkKey' | 'nodes'>>;
	  }
	| { op: 'remove_element'; elementId: string }
	| { op: 'set_scene'; name?: string; backgroundColor?: string };

export interface ScenePatchResult {
	scene: Scene;
	operations: ScenePatchOperation[];
	affectedIds: string[];
	orphanedStepIds: string[];
}

const PATH_RE = /^\s*[Mm][MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]*$/;
const PLAIN_RE = /^[^<>]*$/;
const VECTOR_PRIMITIVES: readonly VectorPrimitive[] = [
	'circle',
	'rect',
	'ellipse',
	'line',
	'polygon',
	'polyline',
	'path',
	'text'
];

function fail(
	path: string,
	message: string,
	code: 'INVALID_INPUT' | 'LIMIT_EXCEEDED' = 'INVALID_INPUT'
): never {
	throw new StudioError(code, `${path}: ${message}`, { path });
}

function object(value: unknown, path: string): Record<string, unknown> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	)
		fail(path, 'must be a plain object');
	return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
	for (const key of Object.keys(value))
		if (!allowed.includes(key)) fail(`${path}.${key}`, `unknown field "${key}"`);
}

function number(
	value: unknown,
	path: string,
	min: number = -LIMITS.maxTranslate,
	max: number = LIMITS.maxTranslate
): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number');
	if (value < min || value > max) fail(path, `must be between ${min} and ${max}`, 'LIMIT_EXCEEDED');
	return value;
}

function integer(value: unknown, path: string, min: number, max: number): number {
	const result = number(value, path, min, max);
	if (!Number.isInteger(result)) fail(path, 'must be an integer');
	return result;
}

function string(value: unknown, path: string, max: number, pattern = PLAIN_RE): string {
	if (typeof value !== 'string') fail(path, 'must be a string');
	if (value.length === 0) fail(path, 'must not be empty');
	if (value.length > max) fail(path, `must be at most ${max} characters`, 'LIMIT_EXCEEDED');
	if (!pattern.test(value)) fail(path, 'does not match the allowed grammar');
	return value;
}

function id(value: unknown, path: string): string {
	return string(value, path, 64, ID_RE);
}

function color(value: unknown, path: string): string {
	if (value === 'none') return 'none';
	return string(value, path, 32, COLOR_RE);
}

function bool(value: unknown, path: string): boolean {
	if (typeof value !== 'boolean') fail(path, 'must be a boolean');
	return value;
}

function point(value: unknown, path: string, fallback?: VectorPoint): VectorPoint {
	if (value === undefined && fallback) return { ...fallback };
	const raw = object(value, path);
	keys(raw, ['x', 'y'], path);
	return { x: number(raw.x, `${path}.x`), y: number(raw.y, `${path}.y`) };
}

function optionalPoint(value: unknown, path: string): VectorPoint | undefined {
	return value === undefined ? undefined : point(value, path);
}

function points(value: unknown, path: string): VectorPoint[] {
	if (!Array.isArray(value) || value.length < 2) fail(path, 'must contain at least two points');
	if (value.length > LIMITS.maxVectorPoints)
		fail(path, `must contain at most ${LIMITS.maxVectorPoints} points`, 'LIMIT_EXCEEDED');
	return value.map((item, index) => point(item, `${path}[${index}]`));
}

const NODE_COMMON = [
	'id',
	'name',
	'label',
	'primitive',
	'role',
	'group',
	'position',
	'scale',
	'rotation',
	'opacity',
	'fill',
	'stroke',
	'strokeWidth',
	'pivot'
] as const;

const NODE_GEOMETRY: Record<VectorPrimitive, readonly string[]> = {
	circle: ['cx', 'cy', 'radius'],
	rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
	ellipse: ['cx', 'cy', 'rx', 'ry'],
	line: ['x1', 'y1', 'x2', 'y2'],
	polygon: ['points'],
	polyline: ['points'],
	path: ['d'],
	text: ['x', 'y', 'text', 'fontSize', 'fontWeight', 'textAnchor']
};

export function validateVectorNode(value: unknown, path = 'node'): VectorNode {
	const raw = object(value, path);
	const primitive = raw.primitive;
	if (!VECTOR_PRIMITIVES.includes(primitive as VectorPrimitive))
		fail(`${path}.primitive`, `must be one of ${VECTOR_PRIMITIVES.join(', ')}`);
	const kind = primitive as VectorPrimitive;
	keys(raw, [...NODE_COMMON, ...NODE_GEOMETRY[kind]], path);

	const nodeId = id(raw.id, `${path}.id`);
	const role = raw.role ?? 'secondary';
	if (!ALLOWED_ROLES.includes(role as ElementRole))
		fail(`${path}.role`, `must be one of ${ALLOWED_ROLES.join(', ')}`);
	const base = {
		id: nodeId,
		name: raw.name === undefined ? nodeId : string(raw.name, `${path}.name`, LIMITS.maxNameLength),
		label:
			raw.label === undefined
				? raw.name === undefined
					? nodeId
					: string(raw.name, `${path}.name`, LIMITS.maxNameLength)
				: string(raw.label, `${path}.label`, LIMITS.maxLabelLength),
		role: role as ElementRole,
		group: raw.group === undefined ? 'root' : id(raw.group, `${path}.group`),
		position: point(raw.position, `${path}.position`, { x: 0, y: 0 }),
		scale: raw.scale === undefined ? 1 : number(raw.scale, `${path}.scale`, 0.01, LIMITS.maxScale),
		rotation:
			raw.rotation === undefined
				? 0
				: number(raw.rotation, `${path}.rotation`, -LIMITS.maxRotation, LIMITS.maxRotation),
		opacity: raw.opacity === undefined ? 1 : number(raw.opacity, `${path}.opacity`, 0, 1),
		fill:
			raw.fill === undefined
				? kind === 'line' || kind === 'polyline' || kind === 'path'
					? 'none'
					: '#e2e8f0'
				: color(raw.fill, `${path}.fill`),
		stroke:
			raw.stroke === undefined
				? kind === 'line' || kind === 'polyline' || kind === 'path'
					? '#e2e8f0'
					: 'none'
				: color(raw.stroke, `${path}.stroke`),
		strokeWidth:
			raw.strokeWidth === undefined
				? kind === 'line' || kind === 'polyline' || kind === 'path'
					? 2
					: 0
				: number(raw.strokeWidth, `${path}.strokeWidth`, 0, LIMITS.maxStrokeWidth),
		...(raw.pivot === undefined ? {} : { pivot: optionalPoint(raw.pivot, `${path}.pivot`) })
	};

	switch (kind) {
		case 'circle':
			return {
				...base,
				primitive: kind,
				cx: number(raw.cx, `${path}.cx`),
				cy: number(raw.cy, `${path}.cy`),
				radius: number(raw.radius, `${path}.radius`, 0.1, LIMITS.maxCanvasDimension)
			};
		case 'rect': {
			const width = number(raw.width, `${path}.width`, 0.1, LIMITS.maxCanvasDimension);
			const height = number(raw.height, `${path}.height`, 0.1, LIMITS.maxCanvasDimension);
			return {
				...base,
				primitive: kind,
				x: number(raw.x, `${path}.x`),
				y: number(raw.y, `${path}.y`),
				width,
				height,
				rx: raw.rx === undefined ? 0 : number(raw.rx, `${path}.rx`, 0, width / 2),
				ry: raw.ry === undefined ? 0 : number(raw.ry, `${path}.ry`, 0, height / 2)
			};
		}
		case 'ellipse':
			return {
				...base,
				primitive: kind,
				cx: number(raw.cx, `${path}.cx`),
				cy: number(raw.cy, `${path}.cy`),
				rx: number(raw.rx, `${path}.rx`, 0.1, LIMITS.maxCanvasDimension),
				ry: number(raw.ry, `${path}.ry`, 0.1, LIMITS.maxCanvasDimension)
			};
		case 'line':
			return {
				...base,
				primitive: kind,
				x1: number(raw.x1, `${path}.x1`),
				y1: number(raw.y1, `${path}.y1`),
				x2: number(raw.x2, `${path}.x2`),
				y2: number(raw.y2, `${path}.y2`)
			};
		case 'polygon':
		case 'polyline':
			return { ...base, primitive: kind, points: points(raw.points, `${path}.points`) };
		case 'path':
			return {
				...base,
				primitive: kind,
				d: string(raw.d, `${path}.d`, LIMITS.maxPathLength, PATH_RE)
			};
		case 'text': {
			const anchor = raw.textAnchor ?? 'start';
			if (!['start', 'middle', 'end'].includes(anchor as string))
				fail(`${path}.textAnchor`, 'must be start, middle, or end');
			return {
				...base,
				primitive: kind,
				x: number(raw.x, `${path}.x`),
				y: number(raw.y, `${path}.y`),
				text: string(raw.text, `${path}.text`, LIMITS.maxTextLength),
				fontSize:
					raw.fontSize === undefined ? 32 : number(raw.fontSize, `${path}.fontSize`, 6, 240),
				fontWeight:
					raw.fontWeight === undefined
						? 600
						: integer(raw.fontWeight, `${path}.fontWeight`, 100, 900),
				textAnchor: anchor as 'start' | 'middle' | 'end'
			};
		}
	}
}

function baseElement(raw: Record<string, unknown>, path: string, scene: Scene) {
	return {
		id: id(raw.id, `${path}.id`),
		name:
			raw.name === undefined
				? string(raw.id, `${path}.id`, 64, ID_RE)
				: string(raw.name, `${path}.name`, LIMITS.maxNameLength),
		position: point(raw.position, `${path}.position`, {
			x: scene.settings.width / 2,
			y: scene.settings.height / 2
		}),
		scale: raw.scale === undefined ? 1 : number(raw.scale, `${path}.scale`, 0.01, LIMITS.maxScale),
		rotation:
			raw.rotation === undefined
				? 0
				: number(raw.rotation, `${path}.rotation`, -LIMITS.maxRotation, LIMITS.maxRotation),
		opacity: raw.opacity === undefined ? 1 : number(raw.opacity, `${path}.opacity`, 0, 1),
		order:
			raw.order === undefined
				? scene.elements.length
				: integer(raw.order, `${path}.order`, -100, 100),
		visible: raw.visible === undefined ? true : bool(raw.visible, `${path}.visible`),
		locked: raw.locked === undefined ? false : bool(raw.locked, `${path}.locked`)
	};
}

function vectorLayer(value: unknown, path: string, scene: Scene): VectorSceneElement {
	const raw = object(value, path);
	keys(
		raw,
		[
			'id',
			'name',
			'width',
			'height',
			'position',
			'scale',
			'rotation',
			'opacity',
			'order',
			'visible',
			'locked'
		],
		path
	);
	return {
		...baseElement(raw, path, scene),
		type: 'vector',
		width:
			raw.width === undefined
				? scene.settings.width
				: number(raw.width, `${path}.width`, 1, LIMITS.maxCanvasDimension),
		height:
			raw.height === undefined
				? scene.settings.height
				: number(raw.height, `${path}.height`, 1, LIMITS.maxCanvasDimension),
		nodes: []
	};
}

function assetElement(value: unknown, path: string, scene: Scene): SvgSceneElement {
	const raw = object(value, path);
	keys(
		raw,
		[
			'id',
			'name',
			'artworkKey',
			'position',
			'scale',
			'rotation',
			'opacity',
			'order',
			'visible',
			'locked'
		],
		path
	);
	const artworkKey = id(raw.artworkKey, `${path}.artworkKey`);
	if (!getArtwork(artworkKey)) fail(`${path}.artworkKey`, `unknown bundled asset "${artworkKey}"`);
	return { ...baseElement(raw, path, scene), type: 'svg', artworkKey };
}

function requireElement(scene: Scene, elementId: string, path: string): SceneElement {
	const element = scene.elements.find((candidate) => candidate.id === elementId);
	if (!element)
		throw new StudioError('TARGET_NOT_FOUND', `${path}: no scene element "${elementId}"`);
	return element;
}

function requireVectorLayer(scene: Scene, elementId: string, path: string): VectorSceneElement {
	const element = requireElement(scene, elementId, path);
	if (element.type !== 'vector')
		fail(path, `scene element "${elementId}" is not an editable vector layer`);
	if (element.locked) fail(path, `scene element "${elementId}" is locked`);
	return element;
}

function nodeChanges(value: unknown, path: string): Partial<VectorNode> {
	const raw = object(value, path);
	keys(
		raw,
		[
			...NODE_COMMON.filter((key) => key !== 'id' && key !== 'primitive'),
			...Object.values(NODE_GEOMETRY).flat()
		],
		path
	);
	if (Object.keys(raw).length === 0) fail(path, 'must change at least one field');
	return raw as Partial<VectorNode>;
}

function elementChanges(value: unknown, path: string) {
	const raw = object(value, path);
	keys(
		raw,
		['name', 'position', 'scale', 'rotation', 'opacity', 'order', 'visible', 'locked'],
		path
	);
	if (Object.keys(raw).length === 0) fail(path, 'must change at least one field');
	const out: Record<string, unknown> = {};
	if (raw.name !== undefined) out.name = string(raw.name, `${path}.name`, LIMITS.maxNameLength);
	if (raw.position !== undefined) out.position = point(raw.position, `${path}.position`);
	if (raw.scale !== undefined)
		out.scale = number(raw.scale, `${path}.scale`, 0.01, LIMITS.maxScale);
	if (raw.rotation !== undefined)
		out.rotation = number(
			raw.rotation,
			`${path}.rotation`,
			-LIMITS.maxRotation,
			LIMITS.maxRotation
		);
	if (raw.opacity !== undefined) out.opacity = number(raw.opacity, `${path}.opacity`, 0, 1);
	if (raw.order !== undefined) out.order = integer(raw.order, `${path}.order`, -100, 100);
	if (raw.visible !== undefined) out.visible = bool(raw.visible, `${path}.visible`);
	if (raw.locked !== undefined) out.locked = bool(raw.locked, `${path}.locked`);
	return out;
}

function replaceElement(scene: Scene, element: SceneElement): void {
	scene.elements = scene.elements.map((candidate) =>
		candidate.id === element.id ? element : candidate
	);
}

export function applySceneOperations(base: Scene, value: unknown): ScenePatchResult {
	assertNoScriptable(value, 'operations');
	if (!Array.isArray(value) || value.length === 0) fail('operations', 'must be a non-empty array');
	if (value.length > LIMITS.maxOperations)
		fail('operations', `at most ${LIMITS.maxOperations} operations per patch`, 'LIMIT_EXCEEDED');

	const scene = structuredClone(base);
	const operations: ScenePatchOperation[] = [];
	const affected = new Set<string>();

	for (let index = 0; index < value.length; index += 1) {
		const path = `operations[${index}]`;
		const raw = object(value[index], path);
		switch (raw.op) {
			case 'add_vector_layer': {
				keys(raw, ['op', 'element'], path);
				const element = vectorLayer(raw.element, `${path}.element`, scene);
				if (scene.elements.some((candidate) => candidate.id === element.id))
					fail(`${path}.element.id`, `scene element "${element.id}" already exists`);
				scene.elements.push(element);
				operations.push({ op: 'add_vector_layer', element });
				affected.add(element.id);
				break;
			}
			case 'add_asset': {
				keys(raw, ['op', 'element'], path);
				const element = assetElement(raw.element, `${path}.element`, scene);
				if (scene.elements.some((candidate) => candidate.id === element.id))
					fail(`${path}.element.id`, `scene element "${element.id}" already exists`);
				scene.elements.push(element);
				operations.push({ op: 'add_asset', element });
				affected.add(element.id);
				break;
			}
			case 'add_node': {
				keys(raw, ['op', 'elementId', 'node'], path);
				const elementId = id(raw.elementId, `${path}.elementId`);
				const layer = requireVectorLayer(scene, elementId, `${path}.elementId`);
				const node = validateVectorNode(raw.node, `${path}.node`);
				if (layer.nodes.some((candidate) => candidate.id === node.id))
					fail(`${path}.node.id`, `node "${node.id}" already exists in "${elementId}"`);
				layer.nodes.push(node);
				operations.push({ op: 'add_node', elementId, node });
				affected.add(`${elementId}/${node.id}`);
				break;
			}
			case 'update_node': {
				keys(raw, ['op', 'elementId', 'nodeId', 'changes'], path);
				const elementId = id(raw.elementId, `${path}.elementId`);
				const nodeId = id(raw.nodeId, `${path}.nodeId`);
				const layer = requireVectorLayer(scene, elementId, `${path}.elementId`);
				const nodeIndex = layer.nodes.findIndex((candidate) => candidate.id === nodeId);
				if (nodeIndex < 0)
					throw new StudioError(
						'TARGET_NOT_FOUND',
						`${path}.nodeId: no node "${nodeId}" in "${elementId}"`
					);
				const changes = nodeChanges(raw.changes, `${path}.changes`);
				const updated = validateVectorNode(
					{ ...layer.nodes[nodeIndex], ...changes },
					`${path}.changes`
				);
				if (updated.id !== nodeId || updated.primitive !== layer.nodes[nodeIndex].primitive)
					fail(`${path}.changes`, 'node id and primitive cannot be changed');
				layer.nodes[nodeIndex] = updated;
				operations.push({ op: 'update_node', elementId, nodeId, changes });
				affected.add(`${elementId}/${nodeId}`);
				break;
			}
			case 'duplicate_node': {
				keys(raw, ['op', 'elementId', 'nodeId', 'newId', 'name', 'label', 'offset'], path);
				const elementId = id(raw.elementId, `${path}.elementId`);
				const nodeId = id(raw.nodeId, `${path}.nodeId`);
				const newId = id(raw.newId, `${path}.newId`);
				const layer = requireVectorLayer(scene, elementId, `${path}.elementId`);
				const source = layer.nodes.find((candidate) => candidate.id === nodeId);
				if (!source)
					throw new StudioError(
						'TARGET_NOT_FOUND',
						`${path}.nodeId: no node "${nodeId}" in "${elementId}"`
					);
				if (layer.nodes.some((candidate) => candidate.id === newId))
					fail(`${path}.newId`, `node "${newId}" already exists in "${elementId}"`);
				const offset = point(raw.offset, `${path}.offset`, { x: 20, y: 20 });
				const duplicated = validateVectorNode(
					{
						...structuredClone(source),
						id: newId,
						name:
							raw.name === undefined
								? `${source.name} copy`
								: string(raw.name, `${path}.name`, LIMITS.maxNameLength),
						label:
							raw.label === undefined
								? `${source.label} copy`
								: string(raw.label, `${path}.label`, LIMITS.maxLabelLength),
						position: {
							x: source.position.x + offset.x,
							y: source.position.y + offset.y
						}
					},
					`${path}.duplicate`
				);
				layer.nodes.push(duplicated);
				operations.push({
					op: 'duplicate_node',
					elementId,
					nodeId,
					newId,
					...(raw.name === undefined ? {} : { name: duplicated.name }),
					...(raw.label === undefined ? {} : { label: duplicated.label }),
					offset
				});
				affected.add(`${elementId}/${newId}`);
				break;
			}
			case 'remove_node': {
				keys(raw, ['op', 'elementId', 'nodeId'], path);
				const elementId = id(raw.elementId, `${path}.elementId`);
				const nodeId = id(raw.nodeId, `${path}.nodeId`);
				const layer = requireVectorLayer(scene, elementId, `${path}.elementId`);
				if (!layer.nodes.some((candidate) => candidate.id === nodeId))
					throw new StudioError(
						'TARGET_NOT_FOUND',
						`${path}.nodeId: no node "${nodeId}" in "${elementId}"`
					);
				layer.nodes = layer.nodes.filter((candidate) => candidate.id !== nodeId);
				operations.push({ op: 'remove_node', elementId, nodeId });
				affected.add(`${elementId}/${nodeId}`);
				break;
			}
			case 'set_semantics': {
				keys(raw, ['op', 'elementId', 'nodeIds', 'role', 'group'], path);
				const elementId = id(raw.elementId, `${path}.elementId`);
				const layer = requireVectorLayer(scene, elementId, `${path}.elementId`);
				if (!Array.isArray(raw.nodeIds) || raw.nodeIds.length === 0)
					fail(`${path}.nodeIds`, 'must be a non-empty array');
				const nodeIds = raw.nodeIds.map((item, nodeIndex) =>
					id(item, `${path}.nodeIds[${nodeIndex}]`)
				);
				const role = raw.role as ElementRole | undefined;
				if (role !== undefined && !ALLOWED_ROLES.includes(role))
					fail(`${path}.role`, `must be one of ${ALLOWED_ROLES.join(', ')}`);
				const group = raw.group === undefined ? undefined : id(raw.group, `${path}.group`);
				if (!role && !group) fail(path, 'must set role, group, or both');
				for (const nodeId of nodeIds) {
					const node = layer.nodes.find((candidate) => candidate.id === nodeId);
					if (!node)
						throw new StudioError(
							'TARGET_NOT_FOUND',
							`${path}.nodeIds: no node "${nodeId}" in "${elementId}"`
						);
					if (role) node.role = role;
					if (group) node.group = group;
					affected.add(`${elementId}/${nodeId}`);
				}
				operations.push({
					op: 'set_semantics',
					elementId,
					nodeIds,
					...(role ? { role } : {}),
					...(group ? { group } : {})
				});
				break;
			}
			case 'update_element': {
				keys(raw, ['op', 'elementId', 'changes'], path);
				const elementId = id(raw.elementId, `${path}.elementId`);
				const element = requireElement(scene, elementId, `${path}.elementId`);
				if (element.locked) fail(`${path}.elementId`, `scene element "${elementId}" is locked`);
				const changes = elementChanges(raw.changes, `${path}.changes`);
				replaceElement(scene, {
					...element,
					...changes,
					position: 'position' in changes ? (changes.position as VectorPoint) : element.position
				} as SceneElement);
				operations.push({ op: 'update_element', elementId, changes });
				affected.add(elementId);
				break;
			}
			case 'remove_element': {
				keys(raw, ['op', 'elementId'], path);
				const elementId = id(raw.elementId, `${path}.elementId`);
				const element = requireElement(scene, elementId, `${path}.elementId`);
				if (element.locked) fail(`${path}.elementId`, `scene element "${elementId}" is locked`);
				scene.elements = scene.elements.filter((candidate) => candidate.id !== elementId);
				operations.push({ op: 'remove_element', elementId });
				affected.add(elementId);
				break;
			}
			case 'set_scene': {
				keys(raw, ['op', 'name', 'backgroundColor'], path);
				if (raw.name === undefined && raw.backgroundColor === undefined)
					fail(path, 'must change name, backgroundColor, or both');
				const name =
					raw.name === undefined
						? undefined
						: string(raw.name, `${path}.name`, LIMITS.maxNameLength);
				const backgroundColor =
					raw.backgroundColor === undefined
						? undefined
						: string(raw.backgroundColor, `${path}.backgroundColor`, 32, COLOR_RE);
				if (name) scene.name = name;
				if (backgroundColor) scene.settings.backgroundColor = backgroundColor;
				operations.push({
					op: 'set_scene',
					...(name ? { name } : {}),
					...(backgroundColor ? { backgroundColor } : {})
				});
				affected.add('scene');
				break;
			}
			default:
				fail(
					`${path}.op`,
					'must be add_vector_layer, add_asset, add_node, update_node, duplicate_node, remove_node, set_semantics, update_element, remove_element, or set_scene'
				);
		}
	}

	if (scene.elements.length > LIMITS.maxSceneElements)
		fail(
			'operations',
			`scene would contain ${scene.elements.length} elements; maximum is ${LIMITS.maxSceneElements}`,
			'LIMIT_EXCEEDED'
		);
	for (const element of scene.elements) {
		if (element.type === 'vector' && element.nodes.length > LIMITS.maxVectorNodes)
			fail(
				'operations',
				`vector layer "${element.id}" would contain ${element.nodes.length} nodes; maximum is ${LIMITS.maxVectorNodes}`,
				'LIMIT_EXCEEDED'
			);
	}
	const registry = buildSceneRegistry(scene.elements);
	if (Object.keys(registry).length > LIMITS.maxTargetRecords)
		fail(
			'operations',
			`scene would expose ${Object.keys(registry).length} targets; maximum is ${LIMITS.maxTargetRecords}`,
			'LIMIT_EXCEEDED'
		);
	const orphanedStepIds = scene.timeline.steps
		.filter((step) => resolveTargetIds(step.target, registry).length === 0)
		.map((step) => step.id);
	const critical = scene.timeline.steps.filter(
		(step) => step.critical && orphanedStepIds.includes(step.id)
	);
	if (critical.length > 0)
		throw new StudioError(
			'TARGET_NOT_FOUND',
			`scene patch would orphan critical timeline step(s): ${critical.map((step) => step.id).join(', ')}`,
			{ stepIds: critical.map((step) => step.id) }
		);

	scene.updatedAt = new Date().toISOString();
	return { scene, operations, affectedIds: [...affected], orphanedStepIds };
}
