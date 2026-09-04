import type { Artwork } from '$lib/types';

/** Transparent mission plot: trajectory, orbit, uplink, ground station and status. */
const missionOverlay: Artwork = {
	key: 'mission-overlay',
	name: 'Mission flight overlay',
	description:
		'A transparent flight plot with launch and orbital paths, stage marker, ground station, uplink and status readout.',
	width: 1280,
	height: 720,
	backgroundColor: '#07111f',
	svg: `<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg" font-family="'Avenir Next', 'Segoe UI', sans-serif">
  <defs>
    <linearGradient id="trajectory-stroke" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="50%" stop-color="#a78bfa"/>
      <stop offset="100%" stop-color="#22d3ee"/>
    </linearGradient>
    <filter id="telemetry-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <g id="mission-overlay">
    <path id="orbit-path" d="M74 413C210 133 594 80 893 190C994 227 1055 295 1077 360" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="8 13" opacity="0.34"/>
    <path id="launch-path" d="M1105 686C1096 575 1053 444 945 348C887 297 835 257 802 208" fill="none" stroke="url(#trajectory-stroke)" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 11" opacity="0.7"/>

    <g id="stage-marker" transform="translate(944 348)">
      <circle r="12" fill="#07111f" stroke="#c4b5fd" stroke-width="3"/>
      <circle r="4" fill="#f59e0b" filter="url(#telemetry-glow)"/>
      <path d="M-17 0h-76" stroke="#64748b" stroke-width="2"/>
      <text x="-101" y="5" text-anchor="end" font-size="16" font-weight="650" letter-spacing="1.5" fill="#cbd5e1">STAGE SEP</text>
    </g>

    <g id="ground-station" transform="translate(430 532)">
      <path d="M-34 24H34L25 41H-25Z" fill="#334155" stroke="#94a3b8" stroke-width="3"/>
      <path d="M0 22V-9" stroke="#cbd5e1" stroke-width="5" stroke-linecap="round"/>
      <g id="ground-dish">
        <path d="M-38-25Q0 13 38-25Q0-7-38-25Z" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/>
        <path d="M0-8L25-42" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/>
        <circle cx="28" cy="-46" r="6" fill="#fb7185"/>
      </g>
    </g>

    <path id="uplink-path" d="M458 486C544 398 631 325 802 208" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 10" opacity="0.8" filter="url(#telemetry-glow)"/>

    <g id="mission-status" transform="translate(682 633)">
      <path d="M0 0H440" stroke="#334155" stroke-width="2"/>
      <circle cx="12" cy="29" r="7" fill="#34d399" filter="url(#telemetry-glow)"/>
      <text x="32" y="35" font-size="18" font-weight="700" letter-spacing="2.5" fill="#e2e8f0">ORBITAL LINK NOMINAL</text>
      <text x="438" y="35" text-anchor="end" font-size="14" font-weight="550" letter-spacing="1.5" fill="#64748b">MISSION 07</text>
    </g>
  </g>
</svg>`,
	registry: {
		'mission-overlay': {
			role: 'utility',
			group: 'root',
			primitiveType: 'group',
			label: 'Entire mission flight overlay'
		},
		'orbit-path': {
			role: 'utility',
			group: 'flight-paths',
			primitiveType: 'path',
			label: 'Orbital insertion path'
		},
		'launch-path': {
			role: 'utility',
			group: 'flight-paths',
			primitiveType: 'path',
			label: 'Rocket launch trajectory'
		},
		'stage-marker': {
			role: 'secondary',
			group: 'telemetry',
			primitiveType: 'group',
			label: 'Stage-separation marker'
		},
		'ground-station': {
			role: 'secondary',
			group: 'communications',
			primitiveType: 'group',
			label: 'Planet ground station'
		},
		'ground-dish': {
			role: 'secondary',
			group: 'communications',
			primitiveType: 'group',
			label: 'Ground-station dish; hinge is 430 524 on the scene'
		},
		'uplink-path': {
			role: 'accent',
			group: 'communications',
			primitiveType: 'path',
			label: 'Ground-to-satellite uplink'
		},
		'mission-status': {
			role: 'accent',
			group: 'telemetry',
			primitiveType: 'group',
			label: 'Orbital-link mission status'
		}
	}
};

export default missionOverlay;
