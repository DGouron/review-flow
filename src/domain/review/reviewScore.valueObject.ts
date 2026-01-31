import { z } from 'zod';

export const ReviewScoreSchema = z.object({
  blocking: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  suggestions: z.number().int().nonnegative(),
});

export type ReviewScoreProps = z.infer<typeof ReviewScoreSchema>;

export type Severity = 'critical' | 'warning' | 'info' | 'clean';

export class ReviewScore {
  private constructor(private readonly props: ReviewScoreProps) {}

  static create(props: ReviewScoreProps): ReviewScore {
    const validated = ReviewScoreSchema.parse(props);
    return new ReviewScore(validated);
  }

  static zero(): ReviewScore {
    return new ReviewScore({ blocking: 0, warnings: 0, suggestions: 0 });
  }

  get blocking(): number {
    return this.props.blocking;
  }

  get warnings(): number {
    return this.props.warnings;
  }

  get suggestions(): number {
    return this.props.suggestions;
  }

  get total(): number {
    return this.blocking + this.warnings + this.suggestions;
  }

  get severity(): Severity {
    if (this.blocking > 0) return 'critical';
    if (this.warnings > 0) return 'warning';
    if (this.suggestions > 0) return 'info';
    return 'clean';
  }

  get isClean(): boolean {
    return this.total === 0;
  }

  get hasBlockingIssues(): boolean {
    return this.blocking > 0;
  }

  add(other: ReviewScore): ReviewScore {
    return new ReviewScore({
      blocking: this.blocking + other.blocking,
      warnings: this.warnings + other.warnings,
      suggestions: this.suggestions + other.suggestions,
    });
  }

  toJSON(): ReviewScoreProps {
    return { ...this.props };
  }

  toString(): string {
    return `${this.blocking}B/${this.warnings}W/${this.suggestions}S`;
  }
}
