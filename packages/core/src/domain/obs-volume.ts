/**
 * The volume curve of the OBS mixer fader, so a slider here moves like the one in OBS. OBS's mixer uses
 * the log fader of libobs (`OBS_FADER_LOG` in obs-audio-controls.c): the top is 0 dB, the bottom −96 dB,
 * and `dB = 6 − 102 · 17^(−position)` in between. Volumes are sent to OBS as a multiplier (`10^(dB/20)`).
 */
const OFFSET_DB = 6;
const RANGE_DB = 96;
const MIN_DB = -RANGE_DB;

/** OBS's volume multiplier for a fader position from 0 (silent) to 1 (0 dB). */
export function faderPositionToMultiplier(position: number): number {
  if (!(position > 0)) return 0;
  if (position >= 1) return 1;
  const db = OFFSET_DB - (RANGE_DB + OFFSET_DB) * ((RANGE_DB + OFFSET_DB) / OFFSET_DB) ** -position;
  return 10 ** (db / 20);
}

/** The fader position (0–1) OBS shows for a volume multiplier; louder than 0 dB shows as the top. */
export function multiplierToFaderPosition(multiplier: number): number {
  if (!(multiplier > 0)) return 0;
  const db = 20 * Math.log10(multiplier);
  if (db >= 0) return 1;
  if (db <= MIN_DB) return 0;
  const logOffset = -Math.log10(OFFSET_DB);
  const logRange = -Math.log10(RANGE_DB + OFFSET_DB);
  return (-Math.log10(-db + OFFSET_DB) - logRange) / (logOffset - logRange);
}
