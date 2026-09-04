/**
 * Hero composition — an original Glyph-branded mark, wordmark, accent ring
 * and highlight. Ids are stable semantic handles the agent can discover via
 * `inspect_animation_targets`.
 */
import type { Artwork } from '$lib/types';

const W = 640;
const H = 260;

// Accents: six small diamonds on a ring around the symbol, spaced 60°.
const accentPoints = [0, 60, 120, 180, 240, 300].map((deg, i) => {
	const r = i % 2 === 0 ? 104 : 82;
	const rad = (deg * Math.PI) / 180;
	return { x: 130 + r * Math.cos(rad), y: 130 + r * Math.sin(rad) };
});

const accents = accentPoints
	.map(
		(p, i) =>
			`<path id="accent-${i + 1}" d="M ${p.x.toFixed(1)},${(p.y - 7).toFixed(1)} l 7,7 l -7,7 l -7,-7 z" fill="#c4b5fd" opacity="0.85"/>`
	)
	.join('\n      ');

const glyphHero: Artwork = {
	key: 'glyph-hero',
	name: 'Glyph brand lockup',
	description: 'Glyph symbol with an accent ring, wordmark, tagline and a status highlight.',
	width: W,
	height: H,
	backgroundColor: '#0f172a',
	svg: `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">
  <defs>
    <linearGradient id="grad-primary" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <linearGradient id="grad-accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#c4b5fd"/>
      <stop offset="100%" stop-color="#ddd6fe"/>
    </linearGradient>
    <filter id="soft-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <g id="symbol" transform="translate(30, 30) scale(1)">
    <g id="ring">
      <path id="segment-top" fill="url(#grad-primary)" d="M 100,50 A 50,50 0 0,1 150,100 L 135,100 A 35,35 0 0,0 100,65 Z"/>
      <path id="segment-left" fill="url(#grad-primary)" d="M 50,100 A 50,50 0 0,1 100,50 L 100,65 A 35,35 0 0,0 65,100 Z"/>
      <path id="segment-bottom" fill="url(#grad-primary)" d="M 100,150 A 50,50 0 0,1 50,100 L 65,100 A 35,35 0 0,0 100,135 Z"/>
    </g>
    <g id="bars" transform="translate(-13, 6)">
      <rect id="bar-horizontal" x="100" y="93" width="38" height="14" rx="2" fill="url(#grad-accent)"/>
      <rect id="bar-vertical" x="124" y="93" width="14" height="50" rx="2" fill="url(#grad-accent)"/>
    </g>
  </g>

  <g id="accents">
      ${accents}
  </g>

  <g id="wordmark-group">
    <text id="wordmark" x="270" y="128" font-size="72" font-weight="800" letter-spacing="2" fill="#f1f5f9">GLYPH</text>
    <text id="tagline" x="273" y="164" font-size="18" font-weight="500" letter-spacing="6" fill="#94a3b8">MOTION STUDIO</text>
    <line id="wordmark-rule" x1="272" y1="182" x2="560" y2="182" stroke="#7c3aed" stroke-width="3" stroke-linecap="round"/>
  </g>

  <g id="highlight-group">
    <circle id="highlight" cx="586" cy="182" r="7" fill="#f59e0b" filter="url(#soft-glow)"/>
  </g>
</svg>`,
	registry: {
		symbol: { role: 'primary', group: 'root', primitiveType: 'group', label: 'Symbol (G mark)' },
		ring: { role: 'primary', group: 'symbol', primitiveType: 'group', label: 'Symbol ring' },
		'segment-top': {
			role: 'primary',
			group: 'ring',
			primitiveType: 'path',
			label: 'Ring segment top'
		},
		'segment-left': {
			role: 'primary',
			group: 'ring',
			primitiveType: 'path',
			label: 'Ring segment left'
		},
		'segment-bottom': {
			role: 'primary',
			group: 'ring',
			primitiveType: 'path',
			label: 'Ring segment bottom'
		},
		bars: { role: 'primary', group: 'symbol', primitiveType: 'group', label: 'Symbol bars' },
		'bar-horizontal': {
			role: 'primary',
			group: 'bars',
			primitiveType: 'rect',
			label: 'Horizontal bar'
		},
		'bar-vertical': {
			role: 'primary',
			group: 'bars',
			primitiveType: 'rect',
			label: 'Vertical bar'
		},
		accents: {
			role: 'accent',
			group: 'root',
			primitiveType: 'group',
			label: 'Accent ring (all diamonds)'
		},
		'accent-1': {
			role: 'accent',
			group: 'accents',
			primitiveType: 'path',
			label: 'Accent diamond 1 (right)'
		},
		'accent-2': {
			role: 'accent',
			group: 'accents',
			primitiveType: 'path',
			label: 'Accent diamond 2 (bottom right)'
		},
		'accent-3': {
			role: 'accent',
			group: 'accents',
			primitiveType: 'path',
			label: 'Accent diamond 3 (bottom left)'
		},
		'accent-4': {
			role: 'accent',
			group: 'accents',
			primitiveType: 'path',
			label: 'Accent diamond 4 (left)'
		},
		'accent-5': {
			role: 'accent',
			group: 'accents',
			primitiveType: 'path',
			label: 'Accent diamond 5 (top left)'
		},
		'accent-6': {
			role: 'accent',
			group: 'accents',
			primitiveType: 'path',
			label: 'Accent diamond 6 (top right)'
		},
		'wordmark-group': {
			role: 'secondary',
			group: 'root',
			primitiveType: 'group',
			label: 'Wordmark block'
		},
		wordmark: {
			role: 'secondary',
			group: 'wordmark-group',
			primitiveType: 'text',
			label: 'Wordmark "GLYPH"'
		},
		tagline: {
			role: 'secondary',
			group: 'wordmark-group',
			primitiveType: 'text',
			label: 'Tagline "MOTION STUDIO"'
		},
		'wordmark-rule': {
			role: 'utility',
			group: 'wordmark-group',
			primitiveType: 'line',
			label: 'Underline rule'
		},
		'highlight-group': {
			role: 'accent',
			group: 'root',
			primitiveType: 'group',
			label: 'Highlight block'
		},
		highlight: {
			role: 'accent',
			group: 'highlight-group',
			primitiveType: 'circle',
			label: 'Status highlight dot'
		}
	}
};

export default glyphHero;
