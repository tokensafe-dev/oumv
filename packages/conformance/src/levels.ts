/**
 * Conformance level arithmetic shared by the legacy adapter suite and the
 * fixture-driven runner (spec §10): levels are cumulative, a skipped case is not
 * a pass, and a level must actually be exercised to be claimed.
 */
export type ConformanceLevel = 0 | 1 | 2 | 3;
export type LevelStatus = 'passed' | 'failed' | 'skipped';

export interface LevelInput {
  level: 1 | 2 | 3;
  status: LevelStatus;
}

/** Highest cumulative level whose cases (and all lower ones) all passed. */
export function determineConformanceLevel(results: LevelInput[]): ConformanceLevel {
  let attained: ConformanceLevel = 0;
  for (const level of [1, 2, 3] as const) {
    const atLevel = results.filter((r) => r.level === level);
    if (atLevel.length === 0) break;
    const upTo = results.filter((r) => r.level <= level);
    if (upTo.some((r) => r.status !== 'passed')) break;
    attained = level;
  }
  return attained;
}

/** Per-level verdicts; independent of the cumulative cap above. */
export function summarizeLevels(results: LevelInput[]): Record<1 | 2 | 3, LevelStatus> {
  const out = {} as Record<1 | 2 | 3, LevelStatus>;
  for (const level of [1, 2, 3] as const) {
    const atLevel = results.filter((r) => r.level === level);
    if (atLevel.length === 0) out[level] = 'skipped';
    else if (atLevel.some((r) => r.status === 'failed')) out[level] = 'failed';
    else if (atLevel.some((r) => r.status === 'skipped')) out[level] = 'skipped';
    else out[level] = 'passed';
  }
  return out;
}
