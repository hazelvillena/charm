import { h } from './dom';
import { Spec } from '../spec/spec';

export class SpecCard {
  readonly el = h('aside', { class: 'spec' });
  show(spec: Spec, onJson: () => void) {
    const k = (a: string, b: string) => h('div', { class: 'k' }, h('span', { text: a }), h('b', { text: b }));
    const d = spec.dimensionsMm, v = spec.volumeCm3;
    this.el.replaceChildren(
      h('h3', { text: spec.name }), h('div', { class: 'sub', text: 'Concept casing · prefab preview' }),
      h('section', {}, k('Overall W × H × D', `${d.width} × ${d.height} × ${d.depth} mm`), k('Outer volume', `${v.outer} cm³`), k('Shell volume', `${v.shell} cm³`),
        k(`Weight (${spec.material})`, `${spec.weightG} g`)),
      h('section', {}, k('Wall target', `${spec.wallMm.target} mm`), k('Wall measured min', spec.wallMm.measuredMin === null ? 'n/a' : `${spec.wallMm.measuredMin} mm`), k('Split line', `z = ${spec.splitZMm} mm`)),
      h('section', {}, h('div', { class: 'k' }, h('span', { text: 'Core (TBD placeholders)' })),
        k('Puck', `Ø${spec.core.puckDiameter} × ${spec.core.puckDepth} mm`), k('Clearance', `${spec.core.puckClearance} mm`),
        k('Magnets', `${spec.core.magnet.count} × Ø${spec.core.magnet.diameter} × ${spec.core.magnet.thickness}`), k('Notch', `${spec.core.notch.width} × ${spec.core.notch.depth} mm`),
        k('Loop hole', `Ø${spec.core.loop.holeDiameter} mm`)),
      h('section', {}, h('div', { class: 'k' }, h('span', { text: 'Checks' })),
        ...spec.checks.map((c) => h('div', { class: c.ok ? 'pass' : 'fail', text: `${c.ok ? '✓' : '✕'} ${c.detail}` }))),
      h('section', {}, k('Cage', `${spec.cage.vertices} verts · ${spec.cage.quads} quads`), k('Subdivision', `level ${spec.cage.subdivisionLevel}`)),
      h('section', {}, ...spec.notes.map((n) => h('div', { class: 'note', text: n })),
        h('div', { style: 'margin-top:8px' }, h('button', { type: 'button', class: 'btn', text: 'Download spec JSON', onClick: onJson }))),
    );
    requestAnimationFrame(() => this.el.classList.add('open'));
  }
  hide() { this.el.classList.remove('open'); }
}
