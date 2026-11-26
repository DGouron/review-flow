export const REVIEW_VERDICTS = ['ready', 'changes', 'stopped', 'incomplete'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

/** Best first. A–D come from the worst retained finding; E only from the code health tally. */
export const QUALITY_GRADES = ['A', 'B', 'C', 'D', 'E'] as const;
export type QualityGrade = (typeof QUALITY_GRADES)[number];

interface FindingCounts {
  blocking: number;
  warnings: number;
}

export function verdictOfCounts(counts: FindingCounts): ReviewVerdict {
  return counts.blocking > 0 || counts.warnings > 0 ? 'changes' : 'ready';
}

export function gradeOfCounts(counts: FindingCounts & { suggestions: number }): QualityGrade {
  if (counts.blocking > 0) return 'D';
  if (counts.warnings > 0) return 'C';
  if (counts.suggestions > 0) return 'B';
  return 'A';
}

export function worstGrade(grades: readonly QualityGrade[]): QualityGrade | null {
  if (grades.length === 0) return null;
  return grades.reduce((worst, grade) =>
    QUALITY_GRADES.indexOf(grade) > QUALITY_GRADES.indexOf(worst) ? grade : worst,
  );
}

export function isGradeWithin(grade: QualityGrade, threshold: QualityGrade): boolean {
  return QUALITY_GRADES.indexOf(grade) <= QUALITY_GRADES.indexOf(threshold);
}

/** Reads a threshold written on the former /10 scale, kept in older project configs. */
export function gradeOfLegacyThreshold(score: number): QualityGrade {
  if (score >= 10) return 'A';
  if (score >= 8) return 'B';
  if (score >= 6) return 'C';
  if (score >= 4) return 'D';
  return 'E';
}

function isQualityGrade(value: string): value is QualityGrade {
  return QUALITY_GRADES.some((grade) => grade === value);
}

export function parseQualityGrade(value: string): QualityGrade | null {
  const upper = value.trim().toUpperCase();
  return isQualityGrade(upper) ? upper : null;
}

function isReviewVerdict(value: string): value is ReviewVerdict {
  return REVIEW_VERDICTS.some((verdict) => verdict === value);
}

export function parseReviewVerdict(value: string): ReviewVerdict | null {
  const lower = value.trim().toLowerCase();
  return isReviewVerdict(lower) ? lower : null;
}

/** A project threshold: a grade letter, or an integer out of 10 written before grades. */
export function qualityThresholdOf(value: unknown): QualityGrade | null {
  if (typeof value === 'string') return parseQualityGrade(value);
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10) {
    return gradeOfLegacyThreshold(value);
  }
  return null;
}
