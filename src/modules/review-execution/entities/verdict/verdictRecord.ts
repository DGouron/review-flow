import { z } from 'zod';

import {
  QUALITY_GRADES,
  type QualityGrade,
  type ReviewVerdict,
  verdictOfCounts,
  worstGrade,
} from '@/modules/shared-kernel/entities/reviewVerdict/reviewVerdict.js';

export const VERDICT_DIMENSIONS = [
  'fiabilite',
  'securite',
  'conception',
  'lisibilite',
  'tests',
  'sante',
] as const;
export type VerdictDimension = (typeof VERDICT_DIMENSIONS)[number];

const verdictFindingSchema = z.object({
  dimension: z.enum(VERDICT_DIMENSIONS),
  severity: z.enum(['blocking', 'important', 'suggestion', 'note']),
  ruling: z.enum(['maintained', 'withdrawn', 'boy-scout', 'out-of-scope']),
  origin: z.enum(['introduced', 'preexisting']).default('introduced'),
});
export type VerdictFinding = z.infer<typeof verdictFindingSchema>;

export const verdictRecordInputSchema = z.object({
  findings: z.array(verdictFindingSchema),
  health: z.enum(QUALITY_GRADES).optional(),
  outcome: z.enum(['completed', 'stopped', 'incomplete']).default('completed'),
});
export type VerdictRecordInput = z.input<typeof verdictRecordInputSchema>;

export interface VerdictRecord {
  verdict: ReviewVerdict;
  grade: QualityGrade;
  levels: Record<VerdictDimension, QualityGrade>;
  counts: { blocking: number; warnings: number; suggestions: number; preexisting: number };
  marker: string;
}

const GRADE_OF_SEVERITY: Record<VerdictFinding['severity'], QualityGrade> = {
  blocking: 'D',
  important: 'C',
  suggestion: 'B',
  note: 'A',
};

/** A boy-scout finding is retained: the author fixes it in this pull request. */
function isRetained(finding: VerdictFinding): boolean {
  return finding.ruling === 'maintained' || finding.ruling === 'boy-scout';
}

function levelOf(
  dimension: VerdictDimension,
  retained: readonly VerdictFinding[],
  health: QualityGrade | undefined,
): QualityGrade {
  const grades = retained
    .filter((finding) => finding.dimension === dimension)
    .map((finding) => GRADE_OF_SEVERITY[finding.severity]);
  if (dimension === 'sante' && health) grades.push(health);
  return worstGrade(grades) ?? 'A';
}

export function recordVerdict(rawInput: VerdictRecordInput): VerdictRecord {
  const input = verdictRecordInputSchema.parse(rawInput);
  const retained = input.findings.filter(isRetained);
  const countOf = (severity: VerdictFinding['severity']): number =>
    retained.filter((finding) => finding.severity === severity).length;

  const counts = {
    blocking: countOf('blocking'),
    warnings: countOf('important'),
    suggestions: countOf('suggestion'),
    preexisting: retained.filter((finding) => finding.origin === 'preexisting').length,
  };
  const level = (dimension: VerdictDimension): QualityGrade =>
    levelOf(dimension, retained, input.health);
  const levels: Record<VerdictDimension, QualityGrade> = {
    fiabilite: level('fiabilite'),
    securite: level('securite'),
    conception: level('conception'),
    lisibilite: level('lisibilite'),
    tests: level('tests'),
    sante: level('sante'),
  };
  const grade = worstGrade(Object.values(levels)) ?? 'A';
  const verdict = input.outcome === 'completed' ? verdictOfCounts(counts) : input.outcome;

  const levelsSegment = VERDICT_DIMENSIONS.map((dimension) => `${dimension}=${levels[dimension]}`);
  const marker =
    `[REVIEW_STATS:blocking=${counts.blocking}:warnings=${counts.warnings}` +
    `:suggestions=${counts.suggestions}:preexisting=${counts.preexisting}` +
    `:verdict=${verdict}:grade=${grade}:levels=${levelsSegment.join(',')}]`;

  return { verdict, grade, levels, counts, marker };
}
