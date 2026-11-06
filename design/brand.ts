/** Clayground brand mark: an organic SubD blob with faint cage lines and eyes. */
export const BRAND_NAME = 'Clayground';
const BLOB = 'M24 4C33 4 40 11 40 20C40 25 38 28 39 32C40 36 44 38 43 42C42 45 38 45 35 43C32 41 30 42 24 42C18 42 16 41 13 43C10 45 6 45 5 42C4 38 8 36 9 32C10 28 8 25 8 20C8 11 15 4 24 4Z';
export const brandMarkSvg = (id = 'bm') => `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
<defs><radialGradient id="${id}g" cx="34%" cy="28%" r="82%"><stop offset="0" stop-color="#b4bcff"/><stop offset=".55" stop-color="#5b6cff"/><stop offset="1" stop-color="#3b49d6"/></radialGradient>
<clipPath id="${id}c"><path d="${BLOB}"/></clipPath></defs>
<path d="${BLOB}" fill="url(#${id}g)"/>
<g clip-path="url(#${id}c)" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".9"><path d="M5 19Q24 27 43 17"/><path d="M6 31Q24 37 42 30"/><path d="M17 4Q12 24 17 45"/><path d="M31 4Q36 24 31 45"/></g>
<ellipse cx="17" cy="13" rx="7" ry="3.8" transform="rotate(-28 17 13)" fill="#fff" fill-opacity=".4"/>
<ellipse cx="19" cy="21" rx="1.5" ry="2.2" fill="#161a52"/><ellipse cx="29" cy="21" rx="1.5" ry="2.2" fill="#161a52"/></svg>`;
