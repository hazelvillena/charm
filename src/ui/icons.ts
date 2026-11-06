import { createElement, Eye, Layers, Rotate3d, LayoutGrid, Link, Download, PanelLeft, PanelRight, ChevronsUpDown, ChevronUp, Maximize2, Minimize2, Undo2, Trash2, Plus, Minus, Scan, Star } from 'lucide';

/** The one icon set (Lucide): same drawing grid, same stroke, so every icon speaks the same language. */
const SET = { eye: Eye, layers: Layers, turntable: Rotate3d, library: LayoutGrid, link: Link, download: Download, panelLeft: PanelLeft, panelRight: PanelRight, collapseAll: ChevronsUpDown, chevronUp: ChevronUp, expand: Maximize2, shrink: Minimize2, undo: Undo2, trash: Trash2, plus: Plus, minus: Minus, fit: Scan, star: Star };
export type IconName = keyof typeof SET;

/** an icon as an SVG string (set it as innerHTML); `size` in px, strokes stay hairline-light */
export function icon(name: IconName, size = 18, stroke = 1.6): string {
  return createElement(SET[name], { width: size, height: size, 'stroke-width': stroke, 'aria-hidden': 'true', class: 'ui-icon' }).outerHTML;
}
