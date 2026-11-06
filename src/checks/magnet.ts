import { CORE } from '../params/core';
import { CheckResult } from './fit';

export const MAGNET_GAP_LIMIT = 1.2; // mm, design rule of thumb: pull force falls off quickly with the gap

/** Retention proxy: the plastic floor between each magnet and the core. */
export function checkMagnetGap(): CheckResult {
  const g = CORE.magnet.gap, m = CORE.magnet;
  return g <= MAGNET_GAP_LIMIT
    ? { id: 'magnet', ok: true, label: 'Magnet hold', detail: `${m.count} magnets under ${g.toFixed(1)} mm of plastic (keep it under ${MAGNET_GAP_LIMIT} mm for a firm hold)` }
    : { id: 'magnet', ok: false, label: 'Magnet hold', detail: `${g.toFixed(1)} mm of plastic over the magnets is too much: hold fades fast past ${MAGNET_GAP_LIMIT} mm`, fix: `Set the magnet gap to ${MAGNET_GAP_LIMIT} mm or less` };
}
