import type { Artwork } from '$lib/types';

/** Original communications satellite with clear mechanical target groups. */
const spaceSatellite: Artwork = {
	key: 'space-satellite',
	name: 'Mission satellite',
	description: 'A communications satellite with solar arrays, dish, signal waves and thruster.',
	width: 340,
	height: 240,
	backgroundColor: '#07111f',
	svg: `<svg width="340" height="240" viewBox="0 0 340 240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="satellite-shell-fill" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#94a3b8"/>
    </linearGradient>
    <linearGradient id="panel-fill" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="50%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#1e40af"/>
    </linearGradient>
  </defs>

  <g id="satellite-system">
    <g id="solar-arrays">
      <g id="panel-left">
        <rect x="15" y="87" width="105" height="66" rx="4" fill="url(#panel-fill)" stroke="#93c5fd" stroke-width="3"/>
        <path d="M41 88v64M67 88v64M93 88v64M16 109h103M16 131h103" fill="none" stroke="#bfdbfe" stroke-width="1.5" opacity="0.75"/>
      </g>
      <g id="panel-right">
        <rect x="220" y="87" width="105" height="66" rx="4" fill="url(#panel-fill)" stroke="#93c5fd" stroke-width="3"/>
        <path d="M246 88v64M272 88v64M298 88v64M221 109h103M221 131h103" fill="none" stroke="#bfdbfe" stroke-width="1.5" opacity="0.75"/>
      </g>
    </g>

    <g id="satellite-body">
      <rect id="body-shell" x="125" y="72" width="90" height="96" rx="16" fill="url(#satellite-shell-fill)" stroke="#e2e8f0" stroke-width="3"/>
      <rect id="body-core" x="144" y="92" width="52" height="56" rx="10" fill="#334155" stroke="#64748b" stroke-width="3"/>
      <circle id="status-light" cx="185" cy="106" r="5" fill="#34d399"/>
    </g>

    <g id="dish-system">
      <path id="dish" d="M149 68Q170 28 191 68Q170 55 149 68Z" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/>
      <line id="dish-mast" x1="170" y1="66" x2="170" y2="43" stroke="#cbd5e1" stroke-width="5" stroke-linecap="round"/>
      <circle id="dish-tip" cx="170" cy="39" r="6" fill="#fb7185"/>
    </g>

    <g id="signal-waves" fill="none" stroke="#22d3ee" stroke-width="4" stroke-linecap="round">
      <path id="signal-near" d="M184 33q18-13 36 0"/>
      <path id="signal-mid" d="M179 22q27-20 54 0" opacity="0.75"/>
      <path id="signal-far" d="M174 11q36-27 72 0" opacity="0.5"/>
    </g>

    <g id="thruster-system">
      <rect id="thruster" x="151" y="168" width="38" height="13" rx="5" fill="#475569" stroke="#94a3b8" stroke-width="2"/>
      <path id="thruster-flame" d="M158 181l12 38 12-38z" fill="#f59e0b" opacity="0.84"/>
    </g>
  </g>
</svg>`,
	registry: {
		'satellite-system': {
			role: 'primary',
			group: 'root',
			primitiveType: 'group',
			label: 'Entire satellite'
		},
		'solar-arrays': {
			role: 'secondary',
			group: 'root',
			primitiveType: 'group',
			label: 'Both solar arrays'
		},
		'panel-left': {
			role: 'secondary',
			group: 'solar-arrays',
			primitiveType: 'group',
			label: 'Left solar array'
		},
		'panel-right': {
			role: 'secondary',
			group: 'solar-arrays',
			primitiveType: 'group',
			label: 'Right solar array'
		},
		'satellite-body': {
			role: 'primary',
			group: 'root',
			primitiveType: 'group',
			label: 'Satellite body'
		},
		'body-shell': {
			role: 'primary',
			group: 'satellite-body',
			primitiveType: 'rect',
			label: 'Body shell'
		},
		'body-core': {
			role: 'primary',
			group: 'satellite-body',
			primitiveType: 'rect',
			label: 'Body core'
		},
		'status-light': {
			role: 'accent',
			group: 'satellite-body',
			primitiveType: 'circle',
			label: 'Satellite status light'
		},
		'dish-system': {
			role: 'secondary',
			group: 'root',
			primitiveType: 'group',
			label: 'Communications dish'
		},
		dish: {
			role: 'secondary',
			group: 'dish-system',
			primitiveType: 'path',
			label: 'Dish reflector'
		},
		'dish-mast': {
			role: 'utility',
			group: 'dish-system',
			primitiveType: 'line',
			label: 'Dish mast'
		},
		'dish-tip': {
			role: 'accent',
			group: 'dish-system',
			primitiveType: 'circle',
			label: 'Dish tip'
		},
		'signal-waves': {
			role: 'accent',
			group: 'root',
			primitiveType: 'group',
			label: 'All communications signals'
		},
		'signal-near': {
			role: 'accent',
			group: 'signal-waves',
			primitiveType: 'path',
			label: 'Near signal wave'
		},
		'signal-mid': {
			role: 'accent',
			group: 'signal-waves',
			primitiveType: 'path',
			label: 'Middle signal wave'
		},
		'signal-far': {
			role: 'accent',
			group: 'signal-waves',
			primitiveType: 'path',
			label: 'Far signal wave'
		},
		'thruster-system': {
			role: 'secondary',
			group: 'root',
			primitiveType: 'group',
			label: 'Satellite thruster'
		},
		thruster: {
			role: 'utility',
			group: 'thruster-system',
			primitiveType: 'rect',
			label: 'Thruster nozzle'
		},
		'thruster-flame': {
			role: 'accent',
			group: 'thruster-system',
			primitiveType: 'path',
			label: 'Thruster flame'
		}
	}
};

export default spaceSatellite;
