import type { DeveloperInsight } from '@/modules/statistics-insights/entities/insight/developerInsight.js';
import type { InsightCategory } from '@/modules/statistics-insights/entities/insight/insightCategory.js';
import { INSIGHT_CATEGORIES } from '@/modules/statistics-insights/entities/insight/insightCategory.js';
import type {
  TeamInsight,
  AverageLevels,
} from '@/modules/statistics-insights/entities/insight/teamInsight.js';

const TEAM_STRENGTH_THRESHOLD = 7;
const TEAM_WEAKNESS_THRESHOLD = 4;

export function computeTeamInsights(developerInsights: DeveloperInsight[]): TeamInsight {
  if (developerInsights.length === 0) {
    return {
      developerCount: 0,
      totalReviewCount: 0,
      averageLevels: { quality: 5, responsiveness: 5, codeVolume: 5, iteration: 5 },
      strengths: [],
      weaknesses: [],
      tips: [],
    };
  }

  const developerCount = developerInsights.length;
  const totalReviewCount = developerInsights.reduce((sum, insight) => sum + insight.reviewCount, 0);

  const averageLevels = computeAverageLevels(developerInsights);
  const strengths = identifyTeamStrengths(averageLevels);
  const weaknesses = identifyTeamWeaknesses(averageLevels);
  const tips = generateTips(developerInsights, weaknesses);

  return {
    developerCount,
    totalReviewCount,
    averageLevels,
    strengths,
    weaknesses,
    tips,
  };
}

function computeAverageLevels(insights: DeveloperInsight[]): AverageLevels {
  const count = insights.length;

  const sumByCategory = {
    quality: 0,
    responsiveness: 0,
    codeVolume: 0,
    iteration: 0,
  };

  for (const insight of insights) {
    for (const category of INSIGHT_CATEGORIES) {
      sumByCategory[category] += insight.categoryLevels[category].level;
    }
  }

  return {
    quality: Math.round(sumByCategory.quality / count),
    responsiveness: Math.round(sumByCategory.responsiveness / count),
    codeVolume: Math.round(sumByCategory.codeVolume / count),
    iteration: Math.round(sumByCategory.iteration / count),
  };
}

function identifyTeamStrengths(averageLevels: AverageLevels): InsightCategory[] {
  const strengths: InsightCategory[] = [];

  for (const category of INSIGHT_CATEGORIES) {
    if (averageLevels[category] >= TEAM_STRENGTH_THRESHOLD) {
      strengths.push(category);
    }
  }

  return strengths;
}

function identifyTeamWeaknesses(averageLevels: AverageLevels): InsightCategory[] {
  const weaknesses: InsightCategory[] = [];

  for (const category of INSIGHT_CATEGORIES) {
    if (averageLevels[category] <= TEAM_WEAKNESS_THRESHOLD) {
      weaknesses.push(category);
    }
  }

  return weaknesses;
}

function generateTips(insights: DeveloperInsight[], weaknesses: InsightCategory[]): string[] {
  const tips: string[] = [];

  for (const weakness of weaknesses) {
    const decliningDevelopers = insights.filter(
      (insight) => insight.categoryLevels[weakness].trend === 'declining',
    );

    if (decliningDevelopers.length > 0) {
      const names = decliningDevelopers.map((developer) => developer.developerName).join(', ');
      tips.push(
        `${categoryLabel(weakness)} is declining for ${names} — consider targeted improvement sessions`,
      );
    }
  }

  const qualitySpread = computeLevelSpread(insights, 'quality');
  if (qualitySpread >= 4) {
    tips.push(
      'Large quality gap between developers — consider pair programming to share best practices',
    );
  }

  const lowBlockingDevelopers = insights.filter(
    (insight) => insight.categoryLevels.quality.level <= 3,
  );
  if (lowBlockingDevelopers.length >= 2) {
    tips.push(
      `${lowBlockingDevelopers.length} developers have low quality scores — review coding standards and provide additional training`,
    );
  }

  const allDeclining = INSIGHT_CATEGORIES.filter((category) => {
    const decliningCount = insights.filter(
      (insight) => insight.categoryLevels[category].trend === 'declining',
    ).length;
    return decliningCount > insights.length / 2;
  });

  for (const category of allDeclining) {
    if (!weaknesses.includes(category)) {
      tips.push(
        `${categoryLabel(category)} trend is declining for most of the team — investigate systemic causes`,
      );
    }
  }

  return tips;
}

function computeLevelSpread(insights: DeveloperInsight[], category: InsightCategory): number {
  const levels = insights.map((insight) => insight.categoryLevels[category].level);
  return Math.max(...levels) - Math.min(...levels);
}

function categoryLabel(category: InsightCategory): string {
  const labels: Record<InsightCategory, string> = {
    quality: 'Quality',
    responsiveness: 'Responsiveness',
    codeVolume: 'Code volume',
    iteration: 'Iteration',
  };
  return labels[category];
}
