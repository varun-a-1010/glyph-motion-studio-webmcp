import type { Artwork } from '$lib/types';

/** Original geometric planet system for the multi-artwork Space Mission sample. */
const spacePlanet: Artwork = {
	key: 'space-planet',
	name: 'Mission planet',
	description: 'A ringed planet with surface bands, atmosphere, moons and distant stars.',
	width: 360,
	height: 360,
	backgroundColor: '#07111f',
	svg: `<svg width="360" height="360" viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="planet-fill" cx="34%" cy="28%" r="72%">
      <stop offset="0%" stop-color="#a5f3fc"/>
      <stop offset="48%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </radialGradient>
    <linearGradient id="ring-fill" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="48%" stop-color="#c4b5fd"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
    <filter id="planet-glow-filter" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
  </defs>

  <g id="planet-system">
    <g id="star-field" fill="#e0f2fe">
      <circle id="star-north" cx="70" cy="54" r="3"/>
      <circle id="star-east" cx="317" cy="120" r="2.5"/>
      <circle id="star-south" cx="278" cy="314" r="3.5"/>
      <path id="star-west" d="M36 190l3.5 7 7 3.5-7 3.5-3.5 7-3.5-7-7-3.5 7-3.5z" fill="#fef3c7"/>
    </g>

    <circle id="planet-glow" cx="180" cy="180" r="112" fill="#38bdf8" opacity="0.2" filter="url(#planet-glow-filter)"/>
    <ellipse id="ring-back" cx="180" cy="181" rx="157" ry="55" fill="none" stroke="url(#ring-fill)" stroke-width="16" opacity="0.55" transform="rotate(-12 180 181)"/>
    <circle id="planet-body" cx="180" cy="180" r="86" fill="url(#planet-fill)" stroke="#bae6fd" stroke-width="2"/>

    <g id="surface-bands" fill="none" stroke-linecap="round">
      <path id="surface-band-top" d="M112 146c31 14 102 14 136-1" stroke="#cffafe" stroke-width="8" opacity="0.34"/>
      <path id="surface-band-mid" d="M98 177c42 18 121 21 165 0" stroke="#1e40af" stroke-width="10" opacity="0.32"/>
      <path id="surface-band-bottom" d="M115 216c30 13 96 14 130-2" stroke="#7dd3fc" stroke-width="7" opacity="0.4"/>
    </g>

    <ellipse id="planet-storm" cx="218" cy="198" rx="18" ry="9" fill="#f59e0b" opacity="0.86" transform="rotate(-9 218 198)"/>
    <ellipse id="planet-shine" cx="148" cy="133" rx="20" ry="38" fill="#ffffff" opacity="0.18" transform="rotate(38 148 133)"/>
    <circle id="planet-atmosphere" cx="180" cy="180" r="91" fill="none" stroke="#67e8f9" stroke-width="5" opacity="0.45"/>

    <path id="ring-front" d="M31 209c35 45 126 57 208 34 44-12 76-34 90-55" fill="none" stroke="url(#ring-fill)" stroke-width="16" stroke-linecap="round" transform="rotate(-12 180 181)"/>
    <path id="ring-highlight" d="M48 215c41 31 113 40 181 22" fill="none" stroke="#fef3c7" stroke-width="3" stroke-linecap="round" opacity="0.72" transform="rotate(-12 180 181)"/>

    <g id="orbital-moons">
      <circle id="moon-near" cx="315" cy="80" r="11" fill="#ddd6fe" stroke="#a78bfa" stroke-width="3"/>
      <circle id="moon-far" cx="58" cy="291" r="7" fill="#fed7aa" stroke="#fb923c" stroke-width="2"/>
    </g>
  </g>
</svg>`,
	registry: {
		'planet-system': {
			role: 'primary',
			group: 'root',
			primitiveType: 'group',
			label: 'Entire planet system'
		},
		'star-field': {
			role: 'utility',
			group: 'root',
			primitiveType: 'group',
			label: 'Planet star field'
		},
		'star-north': {
			role: 'utility',
			group: 'star-field',
			primitiveType: 'circle',
			label: 'North star'
		},
		'star-east': {
			role: 'utility',
			group: 'star-field',
			primitiveType: 'circle',
			label: 'East star'
		},
		'star-south': {
			role: 'utility',
			group: 'star-field',
			primitiveType: 'circle',
			label: 'South star'
		},
		'star-west': {
			role: 'utility',
			group: 'star-field',
			primitiveType: 'path',
			label: 'West star'
		},
		'planet-glow': {
			role: 'accent',
			group: 'planet',
			primitiveType: 'circle',
			label: 'Planet glow'
		},
		'ring-back': {
			role: 'secondary',
			group: 'rings',
			primitiveType: 'ellipse',
			label: 'Rear planetary ring'
		},
		'planet-body': {
			role: 'primary',
			group: 'planet',
			primitiveType: 'circle',
			label: 'Planet body'
		},
		'surface-bands': {
			role: 'secondary',
			group: 'planet',
			primitiveType: 'group',
			label: 'Surface bands'
		},
		'planet-storm': {
			role: 'accent',
			group: 'planet',
			primitiveType: 'ellipse',
			label: 'Planet storm'
		},
		'planet-shine': {
			role: 'accent',
			group: 'planet',
			primitiveType: 'ellipse',
			label: 'Planet shine'
		},
		'planet-atmosphere': {
			role: 'accent',
			group: 'planet',
			primitiveType: 'circle',
			label: 'Atmosphere rim'
		},
		'ring-front': {
			role: 'secondary',
			group: 'rings',
			primitiveType: 'path',
			label: 'Front planetary ring'
		},
		'ring-highlight': {
			role: 'accent',
			group: 'rings',
			primitiveType: 'path',
			label: 'Ring highlight'
		},
		'orbital-moons': {
			role: 'secondary',
			group: 'orbitals',
			primitiveType: 'group',
			label: 'Orbital moons; planet centre is 180 180'
		},
		'moon-near': {
			role: 'secondary',
			group: 'orbitals',
			primitiveType: 'circle',
			label: 'Near moon'
		},
		'moon-far': { role: 'secondary', group: 'orbitals', primitiveType: 'circle', label: 'Far moon' }
	}
};

export default spacePlanet;
