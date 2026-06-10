import { describe, it, expect } from 'vitest';

import { renderSkill } from '@/modules/setup-wizard/services/skillTemplateRenderer.js';

describe('renderSkill', () => {
  it('renders English section headers by default', () => {
    const content = renderSkill('review-code', 'en');
    expect(content).toContain('# Goal');
    expect(content).toContain('## Inputs');
    expect(content).toContain('## Outputs');
  });

  it('renders French section headers when language is fr', () => {
    const content = renderSkill('review-code', 'fr');
    expect(content).toContain('# Objectif');
    expect(content).toContain('## Entrées');
    expect(content).toContain('## Sorties');
  });

  it('embeds the skill name as a title', () => {
    const content = renderSkill('review-followup', 'en');
    expect(content).toContain('review-followup');
  });
});
