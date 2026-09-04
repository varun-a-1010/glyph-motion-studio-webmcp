import type { Artwork } from '$lib/types';

/** Original multi-stage launch vehicle built for separation and deployment choreography. */
const spaceRocket: Artwork = {
	key: 'space-rocket',
	name: 'Staged mission vehicle',
	description:
		'A multi-stage launch vehicle with independent boosters, core, upper stage, fairings and payload.',
	width: 280,
	height: 380,
	backgroundColor: '#07111f',
	svg: `<svg width="280" height="380" viewBox="0 0 280 380" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rocket-metal" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#94a3b8"/>
      <stop offset="38%" stop-color="#f8fafc"/>
      <stop offset="68%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#64748b"/>
    </linearGradient>
    <linearGradient id="booster-metal" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6d28d9"/>
      <stop offset="52%" stop-color="#a78bfa"/>
      <stop offset="100%" stop-color="#5b21b6"/>
    </linearGradient>
    <linearGradient id="plume-fill" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fff7ae"/>
      <stop offset="35%" stop-color="#fb923c"/>
      <stop offset="75%" stop-color="#f43f5e"/>
      <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
    </linearGradient>
    <filter id="plume-glow" x="-80%" y="-30%" width="260%" height="180%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <g id="rocket-system">
		<path id="speed-trails" d="M56 292L30 358M140 319V374M224 292L250 358" fill="none" stroke="#7dd3fc" stroke-width="4" stroke-linecap="round" opacity="0.48"/>

    <g id="plume-system" filter="url(#plume-glow)">
      <path id="core-plume" d="M116 310Q140 378 164 310Z" fill="url(#plume-fill)"/>
      <path d="M73 300Q88 351 103 300Z" fill="url(#plume-fill)" opacity="0.82"/>
      <path d="M177 300Q192 351 207 300Z" fill="url(#plume-fill)" opacity="0.82"/>
    </g>

    <g id="payload">
      <rect x="126" y="73" width="28" height="31" rx="6" fill="#334155" stroke="#cbd5e1" stroke-width="2"/>
      <rect x="110" y="80" width="16" height="18" rx="2" fill="#1d4ed8" stroke="#93c5fd" stroke-width="2"/>
      <rect x="154" y="80" width="16" height="18" rx="2" fill="#1d4ed8" stroke="#93c5fd" stroke-width="2"/>
      <circle cx="140" cy="83" r="4" fill="#34d399"/>
      <path d="M140 73V62" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/>
    </g>

    <g id="upper-stage">
      <path d="M113 103H167L163 191H117Z" fill="url(#rocket-metal)" stroke="#e2e8f0" stroke-width="3"/>
      <rect x="115" y="154" width="50" height="17" rx="3" fill="#2563eb"/>
      <path d="M120 184h40l7 17h-54z" fill="#475569" stroke="#94a3b8" stroke-width="2"/>
    </g>

    <g id="core-stage">
      <rect id="body-shell" x="104" y="185" width="72" height="126" rx="16" fill="url(#rocket-metal)" stroke="#e2e8f0" stroke-width="4"/>
      <rect id="stage-seal" x="103" y="211" width="74" height="18" rx="4" fill="#1e40af"/>
      <path d="M112 288h56l7 23h-70z" fill="#334155" stroke="#94a3b8" stroke-width="3"/>
      <circle id="mission-badge" cx="140" cy="258" r="12" fill="#f59e0b" stroke="#fef3c7" stroke-width="3"/>
    </g>

    <g id="engine-cluster" fill="#0f172a" stroke="#94a3b8" stroke-width="3">
      <ellipse cx="121" cy="311" rx="11" ry="7"/>
      <ellipse cx="140" cy="313" rx="12" ry="8"/>
      <ellipse cx="159" cy="311" rx="11" ry="7"/>
    </g>

    <g id="booster-left">
      <path d="M83 139Q64 158 64 184V286Q64 301 78 307L91 300V172Z" fill="url(#booster-metal)" stroke="#c4b5fd" stroke-width="3"/>
      <path d="M64 286L48 318L80 303Z" fill="#7c3aed" stroke="#c4b5fd" stroke-width="3"/>
      <rect x="67" y="214" width="22" height="13" rx="3" fill="#312e81"/>
    </g>

    <g id="booster-right">
      <path d="M197 139Q216 158 216 184V286Q216 301 202 307L189 300V172Z" fill="url(#booster-metal)" stroke="#c4b5fd" stroke-width="3"/>
      <path d="M216 286L232 318L200 303Z" fill="#7c3aed" stroke="#c4b5fd" stroke-width="3"/>
      <rect x="191" y="214" width="22" height="13" rx="3" fill="#312e81"/>
    </g>

    <g id="fairing-left">
      <path d="M140 18Q103 49 103 105L113 139H140Z" fill="url(#rocket-metal)" stroke="#e2e8f0" stroke-width="3"/>
      <path d="M139 31Q119 54 115 91" fill="none" stroke="#bae6fd" stroke-width="4" stroke-linecap="round" opacity="0.72"/>
    </g>

    <g id="fairing-right">
      <path d="M140 18Q177 49 177 105L167 139H140Z" fill="url(#rocket-metal)" stroke="#e2e8f0" stroke-width="3"/>
      <path d="M141 31Q161 54 165 91" fill="none" stroke="#64748b" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    </g>
  </g>
</svg>`,
	registry: {
		'rocket-system': {
			role: 'primary',
			group: 'root',
			primitiveType: 'group',
			label: 'Entire staged launch vehicle'
		},
		'speed-trails': {
			role: 'utility',
			group: 'root',
			primitiveType: 'path',
			label: 'Launch speed trails'
		},
		'plume-system': {
			role: 'accent',
			group: 'propulsion',
			primitiveType: 'group',
			label: 'All engine plumes'
		},
		'core-plume': {
			role: 'accent',
			group: 'propulsion',
			primitiveType: 'path',
			label: 'Core engine plume'
		},
		payload: {
			role: 'primary',
			group: 'payload-system',
			primitiveType: 'group',
			label: 'Stowed satellite payload'
		},
		'upper-stage': {
			role: 'primary',
			group: 'vehicle-stages',
			primitiveType: 'group',
			label: 'Upper stage'
		},
		'core-stage': {
			role: 'primary',
			group: 'vehicle-stages',
			primitiveType: 'group',
			label: 'Core first stage'
		},
		'stage-seal': {
			role: 'secondary',
			group: 'vehicle-stages',
			primitiveType: 'rect',
			label: 'Stage separation band'
		},
		'mission-badge': {
			role: 'accent',
			group: 'vehicle-stages',
			primitiveType: 'circle',
			label: 'Mission badge'
		},
		'engine-cluster': {
			role: 'utility',
			group: 'propulsion',
			primitiveType: 'group',
			label: 'Core engine cluster'
		},
		'booster-left': {
			role: 'secondary',
			group: 'boosters',
			primitiveType: 'group',
			label: 'Left detachable booster'
		},
		'booster-right': {
			role: 'secondary',
			group: 'boosters',
			primitiveType: 'group',
			label: 'Right detachable booster'
		},
		'fairing-left': {
			role: 'secondary',
			group: 'fairings',
			primitiveType: 'group',
			label: 'Left payload fairing'
		},
		'fairing-right': {
			role: 'secondary',
			group: 'fairings',
			primitiveType: 'group',
			label: 'Right payload fairing'
		}
	}
};

export default spaceRocket;
