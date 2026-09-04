/** Canonical JSON (sorted keys, undefined dropped) + FNV-1a → stable content hash. */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortValue);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			const v = (value as Record<string, unknown>)[key];
			if (v !== undefined) out[key] = sortValue(v);
		}
		return out;
	}
	return value;
}

function fnv1a(input: string, seed: number): string {
	let hash = seed >>> 0;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

export function hashString(input: string): string {
	return fnv1a(input, 0x811c9dc5) + fnv1a(input, 0x9747b28c);
}

export function hashValue(value: unknown): string {
	return hashString(canonicalJson(value));
}
