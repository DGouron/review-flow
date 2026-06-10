import { describe, it, expect, beforeEach } from 'vitest';

import { buildStepRowsModel, buildBannerModel } from '@/dashboard/modules/setupWizard.js';
import { STEP_IDS } from '@/modules/setup-wizard/entities/stepId/stepId.schema.js';
import { wizardStreamEventGuard } from '@/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.guard.js';
import type { WizardStreamEvent } from '@/modules/setup-wizard/entities/wizardStreamEvent/wizardStreamEvent.schema.js';
import { WizardStreamEventFactory } from '@/tests/factories/wizardStreamEvent.factory.js';
import { StubSetupProcessGateway } from '@/tests/stubs/setupProcess.stub.js';

function collectEmittedLines(): string[] {
  const gateway = new StubSetupProcessGateway();
  const lines: string[] = [];
  const handle = gateway.spawn();
  handle.onLine((line) => lines.push(line));

  for (const stepId of STEP_IDS) {
    gateway.emitLine(WizardStreamEventFactory.stepStarted({ step: stepId }));
    gateway.emitLine(WizardStreamEventFactory.stepCompleted({ step: stepId, status: 'succeeded' }));
  }
  gateway.emitLine(
    WizardStreamEventFactory.resume({ resumeAt: 'add-project', position: 5, total: 10 }),
  );
  gateway.emitLine(WizardStreamEventFactory.done());
  gateway.exit(0);

  return lines;
}

describe('Setup Wizard Dashboard — Jarvis HUD (acceptance, Iteration A)', () => {
  let validEvents: WizardStreamEvent[];

  beforeEach(() => {
    const lines = collectEmittedLines();
    const parsedLines = lines.map((line) => JSON.parse(line));
    validEvents = wizardStreamEventGuard.filterCollection(parsedLines).valid;
  });

  describe('the dashboard reflects exactly the 10 steps from SPEC-183', () => {
    it('renders 10 step rows keyed by the real StepIds, updating in order', () => {
      const rows = buildStepRowsModel(validEvents);

      expect(rows).toHaveLength(10);
      expect(rows.map((row) => row.id)).toEqual([...STEP_IDS]);
    });

    it('marks every step as succeeded once its completion event is consumed', () => {
      const rows = buildStepRowsModel(validEvents);

      for (const row of rows) {
        expect(row.status).toBe('succeeded');
      }
    });
  });

  describe('banner events are never rendered as an 11th row', () => {
    it('keeps the row set limited to the 10 step ids', () => {
      const rows = buildStepRowsModel(validEvents);
      const rowIds = rows.map((row) => row.id);

      expect(rowIds).not.toContain('resume');
      expect(rowIds).not.toContain('done');
      expect(rowIds).not.toContain('instructions');
      expect(rowIds).not.toContain('warning');
    });

    it('surfaces resume and done as banners with the resume position', () => {
      const banners = buildBannerModel(validEvents);
      const resumeBanner = banners.find((banner) => banner.kind === 'resume');
      const doneBanner = banners.find((banner) => banner.kind === 'done');

      expect(resumeBanner).toBeDefined();
      expect(resumeBanner?.position).toBe(5);
      expect(resumeBanner?.total).toBe(10);
      expect(doneBanner).toBeDefined();
    });
  });

  describe('the SSE boundary tolerates malformed subprocess output', () => {
    it('skips lines that are not valid wizard events', () => {
      const malformed = wizardStreamEventGuard.safeParse({
        step: 'not-a-real-step',
        status: 'weird',
      });

      expect(malformed.success).toBe(false);
    });
  });
});
