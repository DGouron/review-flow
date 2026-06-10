import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';
import type { ReviewStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';

interface DeveloperData {
  name: string;
  reviews: ReviewStats[];
  trackedMrs: TrackedMr[];
}

interface BuildAiInsightsPromptInput {
  reviews: ReviewStats[];
  reviewContents: Map<string, string>;
  trackedMrs: TrackedMr[];
  language: Language;
}

const REVIEW_EXCERPTS_LIMIT = 5;
const EXCERPT_CHAR_LIMIT = 1500;

function groupReviewsByDeveloper(reviews: ReviewStats[]): Map<string, ReviewStats[]> {
  const grouped = new Map<string, ReviewStats[]>();

  for (const review of reviews) {
    if (!review.assignedBy) continue;

    const existing = grouped.get(review.assignedBy);
    if (existing) {
      existing.push(review);
    } else {
      grouped.set(review.assignedBy, [review]);
    }
  }

  return grouped;
}

function groupTrackedMrsByDeveloper(trackedMrs: TrackedMr[]): Map<string, TrackedMr[]> {
  const grouped = new Map<string, TrackedMr[]>();

  for (const trackedMr of trackedMrs) {
    const username = trackedMr.assignment.username;
    const existing = grouped.get(username);
    if (existing) {
      existing.push(trackedMr);
    } else {
      grouped.set(username, [trackedMr]);
    }
  }

  return grouped;
}

function computeAverageScore(reviews: ReviewStats[]): string {
  const scored = reviews.filter((review) => review.score !== null);
  if (scored.length === 0) return 'N/A';
  const average = scored.reduce((sum, review) => sum + (review.score ?? 0), 0) / scored.length;
  return average.toFixed(1);
}

function computeAverageBlocking(reviews: ReviewStats[]): string {
  if (reviews.length === 0) return '0';
  const average = reviews.reduce((sum, review) => sum + review.blocking, 0) / reviews.length;
  return average.toFixed(1);
}

function computeAverageWarnings(reviews: ReviewStats[]): string {
  if (reviews.length === 0) return '0';
  const average = reviews.reduce((sum, review) => sum + review.warnings, 0) / reviews.length;
  return average.toFixed(1);
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}min`;
}

function computeFirstPassQualityRate(reviews: ReviewStats[]): string {
  const scored = reviews.filter((review) => review.score !== null);
  if (scored.length === 0) return 'N/A';
  const highQuality = scored.filter((review) => (review.score ?? 0) >= 7);
  const rate = (highQuality.length / scored.length) * 100;
  return `${rate.toFixed(0)}%`;
}

function extractReviewExcerpt(content: string): string {
  const sections: string[] = [];

  // Extract executive summary table
  const summaryMatch = content.match(/## Synth[èe]se Ex[ée]cutive[\s\S]*?(?=\n## )/);
  if (summaryMatch) {
    sections.push(summaryMatch[0].trim());
  }

  // Extract score line
  const scoreMatch = content.match(/\*\*Score Global\s*:.*?\*\*/);
  if (scoreMatch) {
    sections.push(scoreMatch[0]);
  }

  // Extract blocking corrections titles only
  const blockingSection = content.match(
    /## Corrections? (?:Importantes?|Bloquantes?)[\s\S]*?(?=\n## )/g,
  );
  if (blockingSection) {
    for (const section of blockingSection) {
      const titles = section.match(/^### \d+\..+$/gm);
      if (titles) {
        sections.push('Corrections: ' + titles.join(', '));
      }
    }
  }

  // Extract positive observations titles
  const positiveSection = content.match(/## Constats? Positifs?[\s\S]*?(?=\n## |$)/);
  if (positiveSection) {
    const titles = positiveSection[0].match(/^### \d+\..+$/gm);
    if (titles) {
      sections.push('Points positifs: ' + titles.join(', '));
    }
  }

  const excerpt = sections.join('\n');
  return excerpt.substring(0, EXCERPT_CHAR_LIMIT);
}

function buildDeveloperSection(
  developer: DeveloperData,
  reviewContents: Map<string, string>,
): string {
  const { name, reviews, trackedMrs } = developer;

  const sortedReviews = [...reviews].toSorted(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const averageScore = computeAverageScore(reviews);
  const averageBlocking = computeAverageBlocking(reviews);
  const averageWarnings = computeAverageWarnings(reviews);
  const averageDuration =
    reviews.length > 0
      ? formatDuration(reviews.reduce((sum, review) => sum + review.duration, 0) / reviews.length)
      : 'N/A';
  const firstPassRate = computeFirstPassQualityRate(reviews);
  const totalAdditions = reviews.reduce(
    (sum, review) => sum + (review.diffStats?.additions ?? 0),
    0,
  );
  const totalDeletions = reviews.reduce(
    (sum, review) => sum + (review.diffStats?.deletions ?? 0),
    0,
  );

  let section = `### Developer: ${name} (${reviews.length} reviews)\n`;
  section += `- Average score: ${averageScore}/10\n`;
  section += `- Average blocking issues: ${averageBlocking}/review\n`;
  section += `- Average warnings: ${averageWarnings}/review\n`;
  section += `- Average review duration: ${averageDuration}\n`;
  section += `- First-pass quality rate: ${firstPassRate} (reviews scoring >= 7 on first try)\n`;
  section += `- Total additions: ${totalAdditions}, deletions: ${totalDeletions}\n`;

  const reviewExcerpts: string[] = [];
  for (let index = 0; index < Math.min(sortedReviews.length, REVIEW_EXCERPTS_LIMIT); index++) {
    const review = sortedReviews[index];
    const mrKey = String(review.mrNumber);
    const content = reviewContents.get(mrKey);
    if (content) {
      const excerpt = extractReviewExcerpt(content);
      if (excerpt.length > 0) {
        reviewExcerpts.push(
          `--- MR ${review.mrNumber} (score: ${review.score ?? 'N/A'}) ---\n${excerpt}`,
        );
      }
    }
  }

  if (reviewExcerpts.length > 0) {
    section += `\nRecent review excerpts:\n${reviewExcerpts.join('\n\n')}\n`;
  }

  if (trackedMrs.length > 0) {
    const totalMrReviews = trackedMrs.reduce((sum, mr) => sum + mr.totalReviews, 0);
    const totalFollowups = trackedMrs.reduce((sum, mr) => sum + mr.totalFollowups, 0);
    const approvedFirst = trackedMrs.filter(
      (mr) => mr.totalReviews <= 1 && mr.state === 'approved',
    ).length;

    section += `\n### MR Lifecycle for ${name}:\n`;
    section += `- Total MRs: ${trackedMrs.length}\n`;
    section += `- Total reviews across MRs: ${totalMrReviews}\n`;
    section += `- Total followups: ${totalFollowups}\n`;
    section += `- MRs approved on first review: ${approvedFirst}\n`;
  }

  return section;
}

function buildTeamSection(reviews: ReviewStats[], developerCount: number): string {
  const averageScore = computeAverageScore(reviews);
  const averageBlocking = computeAverageBlocking(reviews);

  let section = '### Team Statistics:\n';
  section += `- Team average score: ${averageScore}/10\n`;
  section += `- Team average blocking: ${averageBlocking}/review\n`;
  section += `- Total reviews: ${reviews.length}\n`;
  section += `- Developers: ${developerCount}\n`;

  return section;
}

export function buildAiInsightsPrompt(input: BuildAiInsightsPromptInput): string {
  const { reviews, reviewContents, trackedMrs, language } = input;

  const reviewsByDeveloper = groupReviewsByDeveloper(reviews);
  const trackedMrsByDeveloper = groupTrackedMrsByDeveloper(trackedMrs);

  const developerSections: string[] = [];

  for (const [name, developerReviews] of reviewsByDeveloper) {
    const developerTrackedMrs = trackedMrsByDeveloper.get(name) ?? [];
    const section = buildDeveloperSection(
      { name, reviews: developerReviews, trackedMrs: developerTrackedMrs },
      reviewContents,
    );
    developerSections.push(section);
  }

  const teamSection = buildTeamSection(reviews, reviewsByDeveloper.size);

  const developerNames = Array.from(reviewsByDeveloper.keys());

  const prompt = `You are a senior engineering manager analyzing code review data for a development team.
Analyze this data and produce structured insights.

## Data

${developerSections.join('\n\n')}

${teamSection}

## MANDATORY OUTPUT FORMAT

You MUST return a valid JSON object matching this EXACT schema. Every field is REQUIRED and non-empty.

\`\`\`json
{
  "developers": [
    ${developerNames
      .map(
        (name) => `{
      "developerName": "${name}",
      "title": "<string: creative title in ${language === 'fr' ? 'French' : 'English'}, e.g. 'Le Chirurgien du Code'>",
      "titleExplanation": "<string: one sentence why this title fits, with data reference>",
      "strengths": ["<string: concrete strength with numbers>", "<at least 1 item>"],
      "weaknesses": ["<string: concrete weakness with numbers>", "<at least 1 item>"],
      "recommendations": ["<string: actionable recommendation>", "<at least 1 item>"],
      "summary": "<string: 2-3 sentences profiling coding style and quality>"
    }`,
      )
      .join(',\n    ')}
  ],
  "team": {
    "summary": "<string: 2-3 sentences about team dynamics>",
    "strengths": ["<string: team strength>", "<at least 1 item>"],
    "weaknesses": ["<string: team weakness>", "<at least 1 item>"],
    "recommendations": ["<string: team recommendation>", "<at least 1 item>"],
    "dynamics": "<string: analysis of team balance, complementary skills, knowledge gaps>"
  }
}
\`\`\`

## RULES (violations = invalid output)

1. Language: ALL text in ${language === 'fr' ? 'French' : 'English'}
2. Every developer listed above MUST appear in "developers" array with EXACT username
3. "strengths", "weaknesses", "recommendations" arrays must each have AT LEAST 1 item
4. Reference specific data points: scores, percentages, blocking counts, durations
5. Be direct and honest -- do not sugarcoat weaknesses
6. Titles must be creative and unique per developer (no two developers share the same title)
7. Recommendations must be actionable (NOT "improve quality" but "review architecture before implementation to reduce the 1.3 blocking issues/review")
8. "summary" must mention the developer's average score and key characteristic

## OUTPUT

Return ONLY the JSON object. No markdown fences. No explanation before or after. No trailing text.`;

  return prompt;
}
