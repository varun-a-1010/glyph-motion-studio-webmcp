/** Simpler fallback composition: a ring, five orbit dots, one label. */
import type { Artwork } from '$lib/types';

const dots = [0, 72, 144, 216, 288]
	.map((deg, i) => {
		const rad = ((deg - 90) * Math.PI) / 180;
		const x = 160 + 70 * Math.cos(rad);
		const y = 120 + 70 * Math.sin(rad);
		return `<circle id="dot-${i + 1}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="#2dd4bf"/>`;
	})
	.join('\n    ');

const orbitSimple: Artwork = {
	key: 'orbit-simple',
	name: 'Orbit',
	description: 'A ring with five orbiting dots and a label.',
	width: 320,
	height: 240,
	backgroundColor: '#0b1120',
	svg: `<svg width="320" height="240" viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, -apple-system, sans-serif">
  <circle id="ring" cx="160" cy="120" r="70" fill="none" stroke="#14b8a6" stroke-width="4"/>
  <circle id="core" cx="160" cy="120" r="22" fill="#5eead4"/>
  <g id="dots">
    ${dots}
  </g>
  <text id="label" x="160" y="226" text-anchor="middle" font-size="18" font-weight="700" letter-spacing="4" fill="#e2e8f0">ORBIT</text>
</svg>`,
	registry: {
		ring: { role: 'secondary', group: 'root', primitiveType: 'circle', label: 'Outer ring' },
		core: { role: 'primary', group: 'root', primitiveType: 'circle', label: 'Core' },
		dots: { role: 'accent', group: 'root', primitiveType: 'group', label: 'All orbit dots' },
		'dot-1': { role: 'accent', group: 'dots', primitiveType: 'circle', label: 'Dot 1' },
		'dot-2': { role: 'accent', group: 'dots', primitiveType: 'circle', label: 'Dot 2' },
		'dot-3': { role: 'accent', group: 'dots', primitiveType: 'circle', label: 'Dot 3' },
		'dot-4': { role: 'accent', group: 'dots', primitiveType: 'circle', label: 'Dot 4' },
		'dot-5': { role: 'accent', group: 'dots', primitiveType: 'circle', label: 'Dot 5' },
		label: { role: 'secondary', group: 'root', primitiveType: 'text', label: 'Label' }
	}
};

export default orbitSimple;
