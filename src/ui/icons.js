// Inline SVG drawings for the interface: building icons, DEB's face, ID-badge portraits.
// All markup here is static or built from validated values (see safeColor), so it is safe as HTML.
import { safeColor } from './dom.js';

const S = 'stroke="#111" stroke-width="2"';

const BUILDING = {
  belt: `<rect x="2" y="9" width="36" height="22" rx="3" fill="#2b2f36" ${S}/>
    <path d="M8 14l5 6-5 6M17 14l5 6-5 6M26 14l5 6-5 6" fill="none" stroke="#facc15" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`,
  unpacker: `<path d="M8 11L4 4l9 5zM32 11l4-7-9 5z" fill="#c8915a" stroke="#111" stroke-width="1.5"/>
    <rect x="3" y="10" width="34" height="23" rx="4" fill="#2b7bd6" ${S}/>
    <rect x="7" y="15" width="14" height="11" rx="2" fill="#dbeafe"/>
    <path d="M24 20.5h9M29 16.5l4 4-4 4" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  press: `<rect x="13" y="3" width="14" height="9" fill="#4b5563" ${S}/>
    <rect x="4" y="12" width="32" height="14" rx="2" fill="#f97316" ${S}/>
    <rect x="4" y="26" width="32" height="9" fill="#facc15" ${S}/>
    <path d="M8 35l5-9M16 35l5-9M24 35l5-9M32 35l4-7" stroke="#111" stroke-width="2.6"/>
    <circle cx="31" cy="18" r="2.2" fill="#dc2626"/>`,
  packer: `<rect x="9" y="3" width="22" height="7" rx="2" fill="#7e22ce"/>
    <circle cx="14" cy="6.5" r="1.6" fill="#ef4444"/><circle cx="20" cy="6.5" r="1.6" fill="#ef4444"/><circle cx="26" cy="6.5" r="1.6" fill="#ef4444"/>
    <rect x="4" y="10" width="32" height="25" rx="8" fill="#c084fc" ${S}/>
    <rect x="12" y="16" width="16" height="12" rx="1" fill="#c8915a" stroke="#7c4a1e" stroke-width="1.6"/>
    <path d="M20 16v12M12 22h16" stroke="#dc2626" stroke-width="2"/>`,
  chute: `<path d="M4 7h32l-6 28H10z" fill="#16a34a" ${S} stroke-linejoin="round"/>
    <path d="M20 11v15M13.5 20l6.5 6.5 6.5-6.5" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  crate: `<rect x="5" y="5" width="30" height="30" fill="#c8915a" stroke="#6b3f17" stroke-width="2.5"/>
    <rect x="9.5" y="9.5" width="21" height="21" fill="none" stroke="#6b3f17" stroke-width="2"/>
    <path d="M9.5 9.5l21 21M30.5 9.5l-21 21" stroke="#6b3f17" stroke-width="2"/>`,
  sprinkler: `<path d="M20 18L5 38h30z" fill="#f97316" opacity=".6"/>
    <rect x="18" y="1" width="4" height="6" fill="#111"/>
    <circle cx="20" cy="15" r="10" fill="#374151" ${S}/>
    <circle cx="20" cy="15" r="5" fill="#dc2626"/>`,
  forklift: `<rect x="3" y="12" width="21" height="16" rx="3" fill="#eab308" ${S}/>
    <rect x="7" y="15" width="9" height="8" rx="1" fill="#1f2937"/>
    <rect x="24" y="8" width="4" height="25" fill="#374151"/>
    <path d="M28 18h10M28 28h10" stroke="#6b7280" stroke-width="3"/>
    <circle cx="9" cy="31" r="4" fill="#111"/><circle cx="20" cy="31" r="4" fill="#111"/>`,
  railgun: `<rect x="2" y="15" width="26" height="12" rx="3" fill="#475569" ${S}/>
    <rect x="26" y="18" width="12" height="6" fill="#94a3b8" ${S}/>
    <path d="M7 15v-5h8v5" fill="#facc15" stroke="#111" stroke-width="2"/>
    <path d="M8 21h14" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
    <circle cx="9" cy="31" r="3.5" fill="#111"/><circle cx="21" cy="31" r="3.5" fill="#111"/>`,
  salesman: `<rect x="3" y="6" width="20" height="15" rx="2" fill="#1f2937" ${S}/>
    <rect x="6" y="9" width="14" height="9" fill="#38bdf8"/>
    <path d="M9 21l-2 5M17 21l2 5" stroke="#111" stroke-width="2"/>
    <circle cx="30" cy="12" r="5" fill="#f5c9a0" stroke="#111" stroke-width="1.8"/>
    <path d="M23 35v-9q0-7 7-7t7 7v9z" fill="#b91c1c" ${S}/>
    <path d="M30 20v8" stroke="#facc15" stroke-width="2.5"/>
    <rect x="2" y="28" width="19" height="7" rx="1.5" fill="#a16207" ${S}/>`,
  wetfloor: `<path d="M20 3L38 35H2z" fill="#facc15" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M20 13v11" stroke="#111" stroke-width="4" stroke-linecap="round"/><circle cx="20" cy="29.5" r="2.4" fill="#111"/>`,
  samples: `<path d="M8 26v11M32 26v11" stroke="#111" stroke-width="3"/>
    <rect x="3" y="20" width="34" height="7" rx="1.5" fill="#f472b6" ${S}/>
    <path d="M9 20l4-9h7l-3 9z" fill="#fde047" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M26 20l2-11" stroke="#6b3f17" stroke-width="1.6"/><circle cx="28.3" cy="8" r="3.3" fill="#fb923c" stroke="#111" stroke-width="1.4"/>`,
  // The Back's parts (0.4).
  conv: `<rect x="2" y="9" width="36" height="22" rx="3" fill="#2b2f36" ${S}/>
    <path d="M8 14l5 6-5 6M17 14l5 6-5 6M26 14l5 6-5 6" fill="none" stroke="#facc15" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M30 5l3-3 3 3-3 3z" fill="#c8915a" stroke="#111" stroke-width="1.2"/>`,
  split: `<path d="M2 15h14q6 0 10-6l4-6M16 25q6 0 10 6l4 6M2 15v10h36" fill="none" stroke="#2b2f36" stroke-width="7" stroke-linejoin="round"/>
    <path d="M10 20l11-4 7-10 5 3-6 11 6 11-5 3-7-10z" fill="#d4d8dc" stroke="#111" stroke-width="2" stroke-linejoin="round"/>`,
  over: `<rect x="13" y="2" width="14" height="36" fill="#2b2f36" ${S}/>
    <rect x="2" y="13" width="36" height="14" fill="#2b2f36" ${S}/>
    <rect x="10" y="10" width="20" height="20" fill="#facc15" ${S}/>
    <path d="M10 14l4-4M10 22l12-12M10 30l20-20M18 30l12-12M26 30l4-4" stroke="#111" stroke-width="2.4"/>
    <rect x="15" y="10" width="10" height="20" fill="#2b2f36" stroke="#111" stroke-width="1.5"/>
    <path d="M17 22l3-4 3 4" fill="none" stroke="#facc15" stroke-width="2"/>`,
  intern: `<circle cx="20" cy="9" r="6.5" fill="#f2c9a0" ${S}/>
    <path d="M13.5 8q1-7 6.5-7t6.5 7q-3-3-6.5-3t-6.5 3z" fill="#6b4423" stroke="#111" stroke-width="1.5"/>
    <path d="M11 36v-14q0-7 9-7t9 7v14z" fill="#ff8c1a" ${S}/>
    <path d="M12 25h16M12 30h16" stroke="#f7f3b0" stroke-width="2"/>
    <path d="M28 20l8-3" stroke="#ff8c1a" stroke-width="3.5" stroke-linecap="round"/>`,
  bin: `<rect x="4" y="5" width="32" height="30" rx="4" fill="#9aa1a9" ${S}/>
    <rect x="8" y="9" width="24" height="18" fill="#2f3439"/>
    <path d="M8 13l14 14M8 21l6 6M14 9l18 18M22 9l10 10M8 27l18-18M8 19l10-10M18 27l14-14M26 27l6-6" stroke="#cfd4d8" stroke-width="1"/>
    <rect x="3" y="25" width="34" height="10" rx="2" fill="#d9372b" ${S}/>
    <path d="M9 30h22" stroke="#fff" stroke-width="2.5" stroke-dasharray="3 1.5"/>`,
  // The Back's machines and the Rebrander (0.4, stage 3): a coloured machine with a window showing
  // what it makes, and the yellow out arrow.
  still: `<rect x="3" y="3" width="34" height="34" rx="5" fill="#4b5058" ${S}/>
    <rect x="6.5" y="6.5" width="27" height="27" rx="4" fill="#d9372b" stroke="#111" stroke-width="1.6"/>
    <circle cx="20" cy="19" r="9.5" fill="#fbfbf4" stroke="#111" stroke-width="1.8"/>
    <path d="M18 12h4v3q3 1 3 4v6h-10v-6q0-3 3-4z" fill="#d9372b" stroke="#111" stroke-width="1.4"/><rect x="16.5" y="19" width="7" height="3" fill="#fbfbf4"/>
    <path d="M31 15l7 5-7 5z" fill="#ffe14a" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>`,
  cannery: `<rect x="3" y="3" width="34" height="34" rx="5" fill="#4b5058" ${S}/>
    <rect x="6.5" y="6.5" width="27" height="27" rx="4" fill="#3fae49" stroke="#111" stroke-width="1.6"/>
    <circle cx="20" cy="19" r="9.5" fill="#fbfbf4" stroke="#111" stroke-width="1.8"/>
    <rect x="16" y="12" width="8" height="14" rx="2" fill="#3fae49" stroke="#111" stroke-width="1.4"/><path d="M21 14l-3 5h2.5l-1.5 4 3.5-5.5h-2.5z" fill="#f2c21b"/>
    <path d="M31 15l7 5-7 5z" fill="#ffe14a" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>`,
  spooler: `<rect x="3" y="3" width="34" height="34" rx="5" fill="#4b5058" ${S}/>
    <rect x="6.5" y="6.5" width="27" height="27" rx="4" fill="#ff8c1a" stroke="#111" stroke-width="1.6"/>
    <circle cx="20" cy="19" r="9.5" fill="#fbfbf4" stroke="#111" stroke-width="1.8"/>
    <circle cx="20" cy="19" r="5.5" fill="none" stroke="#111" stroke-width="4.5"/><circle cx="20" cy="19" r="5.5" fill="none" stroke="#ff8c1a" stroke-width="2.6"/>
    <path d="M31 15l7 5-7 5z" fill="#ffe14a" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>`,
  winder: `<rect x="3" y="3" width="34" height="34" rx="5" fill="#4b5058" ${S}/>
    <rect x="6.5" y="6.5" width="27" height="27" rx="4" fill="#b9bfc6" stroke="#111" stroke-width="1.6"/>
    <circle cx="20" cy="19" r="9.5" fill="#fbfbf4" stroke="#111" stroke-width="1.8"/>
    <circle cx="20" cy="19" r="6.5" fill="#d4d8dc" stroke="#111" stroke-width="1.5"/><circle cx="20" cy="19" r="3" fill="#e8c88a" stroke="#111" stroke-width="1.2"/>
    <path d="M31 15l7 5-7 5z" fill="#ffe14a" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>`,
  bender: `<rect x="3" y="3" width="34" height="34" rx="5" fill="#4b5058" ${S}/>
    <rect x="6.5" y="6.5" width="27" height="27" rx="4" fill="#8b5cf6" stroke="#111" stroke-width="1.6"/>
    <circle cx="20" cy="19" r="9.5" fill="#fbfbf4" stroke="#111" stroke-width="1.8"/>
    <ellipse cx="18" cy="19" rx="4.5" ry="5" fill="none" stroke="#111" stroke-width="3"/><ellipse cx="22" cy="19" rx="4.5" ry="5" fill="none" stroke="#111" stroke-width="3"/><ellipse cx="18" cy="19" rx="4.5" ry="5" fill="none" stroke="#8f979f" stroke-width="1.4"/><ellipse cx="22" cy="19" rx="4.5" ry="5" fill="none" stroke="#8f979f" stroke-width="1.4"/>
    <path d="M31 15l7 5-7 5z" fill="#ffe14a" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>`,
  rebrand: `<rect x="3" y="3" width="34" height="34" rx="5" fill="#4b5058" ${S}/>
    <rect x="6.5" y="6.5" width="27" height="27" rx="4" fill="#2f8fe0" stroke="#111" stroke-width="1.6"/>
    <rect x="9" y="8" width="22" height="10" rx="4.5" fill="#fbfbf4" stroke="#111" stroke-width="1.6"/>
    <path d="M20 9.5l1.2 2.5 2.7.3-2 1.8.6 2.7-2.5-1.4-2.5 1.4.6-2.7-2-1.8 2.7-.3z" fill="#ffc928" stroke="#111" stroke-width=".8"/>
    <rect x="8" y="25" width="24" height="7" rx="1.5" fill="#1d2125"/><path d="M11 28.5h18" stroke="#ffd23f" stroke-width="2.5" stroke-dasharray="2.5 1"/>
    <path d="M31 15l7 5-7 5z" fill="#ffe14a" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>`,
  drop: `<rect x="2" y="10" width="10" height="20" fill="#5b6168" ${S}/>
    <rect x="8" y="4" width="28" height="32" fill="#f2c21b" ${S}/>
    <path d="M8 12l8-8M8 22l18-18M8 32l28-28M18 36l18-18M28 36l8-8" stroke="#222" stroke-width="3"/>
    <rect x="12" y="12" width="20" height="18" rx="2" fill="#121417" ${S}/>
    <path d="M17 18l6-2 5 1v6l-4 2-6-1z" fill="#c8924f" stroke="#111" stroke-width="1.2"/>`,
  upgrade: `<circle cx="20" cy="20" r="15" fill="#16a34a" ${S}/>
    <path d="M12 21l8-9 8 9M12 29l8-9 8 9" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  rebuild: `<circle cx="20" cy="20" r="15" fill="#2563eb" ${S}/>
    <path d="M12 28l10-10" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M21 12a6 6 0 0 1 8 8l-3-1-3-3z" fill="#fff"/>`,
  remove: `<circle cx="20" cy="20" r="15" fill="#dc2626" ${S}/>
    <path d="M13.5 13.5l13 13M26.5 13.5l-13 13" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>`,
};

export function buildingIcon(k) {
  return `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">${BUILDING[k] || BUILDING.crate}</svg>`;
}

/** DEB the HR chatbot. mood: 'flat' | 'angry' | 'smug'. */
export function debFace(mood = 'flat') {
  const face = mood === 'angry' ? '#fca5a5' : '#d1d5db';
  let eyes, mouth, extra = '';
  if (mood === 'angry') {
    eyes = `<circle cx="21" cy="30" r="4.5" fill="#fff" stroke="#1f2937" stroke-width="2.5"/><circle cx="21" cy="30.5" r="2" fill="#dc2626"/>
      <circle cx="39" cy="30" r="4.5" fill="#fff" stroke="#1f2937" stroke-width="2.5"/><circle cx="39" cy="30.5" r="2" fill="#dc2626"/>`;
    extra = '<path d="M13 21l12 5M47 21l-12 5" stroke="#1f2937" stroke-width="3.5" stroke-linecap="round"/>';
    mouth = '<path d="M20 45q10-8 20 0" fill="none" stroke="#1f2937" stroke-width="3.5" stroke-linecap="round"/>';
  } else if (mood === 'smug') {
    eyes = `<path d="M16 29a5 5 0 0 0 10 0z" fill="#fff" stroke="#1f2937" stroke-width="2.5"/><circle cx="21" cy="30.5" r="1.8" fill="#1f2937"/>
      <path d="M34 29a5 5 0 0 0 10 0z" fill="#fff" stroke="#1f2937" stroke-width="2.5"/><circle cx="39" cy="30.5" r="1.8" fill="#1f2937"/>
      <path d="M15 29h12M33 29h12" stroke="#1f2937" stroke-width="3" stroke-linecap="round"/>`;
    mouth = '<path d="M20 41q11 6 21-4" fill="none" stroke="#1f2937" stroke-width="3.5" stroke-linecap="round"/>';
    extra = '<path d="M14 22l11-1M35 20l11 3" stroke="#1f2937" stroke-width="2.5" stroke-linecap="round"/>';
  } else {
    eyes = `<circle cx="21" cy="29" r="5" fill="#fff" stroke="#1f2937" stroke-width="2.5"/><circle cx="21" cy="29" r="2.1" fill="#1f2937"/>
      <circle cx="39" cy="29" r="5" fill="#fff" stroke="#1f2937" stroke-width="2.5"/><circle cx="39" cy="29" r="2.1" fill="#1f2937"/>`;
    mouth = `<rect x="19" y="39" width="22" height="6" rx="1.5" fill="#fff" stroke="#1f2937" stroke-width="2.5"/>
      <path d="M24.5 39v6M30 39v6M35.5 39v6" stroke="#1f2937" stroke-width="1.6"/>`;
  }
  return `<svg viewBox="0 0 60 60" aria-hidden="true" focusable="false">
    <line x1="30" y1="5" x2="30" y2="13" stroke="#374151" stroke-width="3"/>
    <circle cx="30" cy="5" r="4" fill="#dc2626" stroke="#1f2937" stroke-width="1.5"/>
    <rect x="2.5" y="25" width="6" height="13" rx="2" fill="#9ca3af" stroke="#1f2937" stroke-width="2"/>
    <rect x="51.5" y="25" width="6" height="13" rx="2" fill="#9ca3af" stroke="#1f2937" stroke-width="2"/>
    <rect x="8" y="13" width="44" height="40" rx="9" fill="${face}" stroke="#1f2937" stroke-width="3"/>
    ${extra}${eyes}${mouth}</svg>`;
}

/** An ID badge on a clip, in a player's colour. mood: 'happy' | 'flat' | 'cross'. */
export function badge(color, mood = 'flat') {
  const c = safeColor(color);
  const mouth = mood === 'happy' ? '<path d="M24 43q6 5 12 0" fill="none" stroke="#1f2937" stroke-width="2.2" stroke-linecap="round"/>'
    : mood === 'cross' ? '<path d="M24 45q6-5 12 0" fill="none" stroke="#1f2937" stroke-width="2.2" stroke-linecap="round"/><path d="M22 32l6 2M38 32l-6 2" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/>'
      : '<path d="M25 44h10" stroke="#1f2937" stroke-width="2.2" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 60 76" aria-hidden="true" focusable="false">
    <rect x="23" y="1" width="14" height="9" rx="2" fill="#6b7280" stroke="#1f2937" stroke-width="2"/>
    <rect x="3" y="7" width="54" height="67" rx="6" fill="#fff" stroke="#1f2937" stroke-width="3"/>
    <path d="M4.5 13a5 5 0 0 1 5-5h41a5 5 0 0 1 5 5v4h-51z" fill="${c}"/>
    <circle cx="30" cy="39" r="13" fill="#f2c9a0" stroke="#1f2937" stroke-width="2.5"/>
    <path d="M17.5 36q2-12 12.5-12t12.5 12q-6-6-12.5-5t-12.5 5z" fill="#5b3a1e"/>
    <circle cx="25" cy="38" r="1.8" fill="#1f2937"/><circle cx="35" cy="38" r="1.8" fill="#1f2937"/>
    ${mouth}
    <rect x="12" y="60" width="36" height="7" rx="3" fill="${c}" stroke="#1f2937" stroke-width="1.5"/></svg>`;
}

export const SUNGLASSES = `<svg viewBox="0 0 40 16" aria-hidden="true" focusable="false">
  <path d="M1 3h38" stroke="#111" stroke-width="2.5"/>
  <path d="M3 3h14l-2 9q-1 3-5 3t-6-3z" fill="#111"/><path d="M23 3h14l-1 9q-2 3-6 3t-5-3z" fill="#111"/>
  <path d="M6 6l4 0" stroke="#fff" stroke-width="1.5" opacity=".7"/></svg>`;

export const CLOCK = `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
  <circle cx="20" cy="20" r="16" fill="#fff" stroke="#111" stroke-width="3"/>
  <path d="M20 10v10l7 5" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
