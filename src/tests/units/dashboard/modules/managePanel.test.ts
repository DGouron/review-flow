import { describe, expect, it } from 'vitest';

import {
  buildManagePanelModel,
  renderManagePanelHtml,
  buildOptimisticAddedRow,
  validateLocalPathInput,
} from '@/dashboard/modules/managePanel.js';

describe('managePanel module', () => {
  describe('buildManagePanelModel', () => {
    it('returns rows in repository input order', () => {
      const model = buildManagePanelModel({
        repositories: [
          { name: 'first', localPath: '/home/dev/first', enabled: true },
          { name: 'second', localPath: '/home/dev/projects/second', enabled: false },
        ],
        isOpen: false,
      });

      expect(model.rows.map((row) => row.localPath)).toEqual([
        '/home/dev/first',
        '/home/dev/projects/second',
      ]);
    });

    it('exposes shortPath as the last two path segments', () => {
      const model = buildManagePanelModel({
        repositories: [
          { name: 'frontend', localPath: '/home/dev/projects/frontend', enabled: true },
        ],
        isOpen: false,
      });

      expect(model.rows[0]?.shortPath).toBe('projects/frontend');
    });

    it('marks the enabled flag on each row', () => {
      const model = buildManagePanelModel({
        repositories: [
          { name: 'a', localPath: '/a', enabled: true },
          { name: 'b', localPath: '/b', enabled: false },
        ],
        isOpen: false,
      });

      expect(model.rows.map((row) => row.enabled)).toEqual([true, false]);
    });

    it('forwards isOpen through the viewmodel', () => {
      const model = buildManagePanelModel({ repositories: [], isOpen: true });
      expect(model.isOpen).toBe(true);
    });
  });

  describe('renderManagePanelHtml', () => {
    it('emits one row per repository with a data-local-path attribute', () => {
      const html = renderManagePanelHtml({
        rows: [
          {
            name: 'frontend',
            localPath: '/home/dev/frontend',
            shortPath: 'dev/frontend',
            enabled: true,
          },
          { name: 'api', localPath: '/home/dev/api', shortPath: 'dev/api', enabled: false },
        ],
        isOpen: false,
      });

      expect(html).toContain('data-local-path="/home/dev/frontend"');
      expect(html).toContain('data-local-path="/home/dev/api"');
    });

    it('emits an add form with input + submit button', () => {
      const html = renderManagePanelHtml({ rows: [], isOpen: false });

      expect(html).toContain('class="add-form"');
      expect(html).toContain('class="add-form-input"');
      expect(html).toContain('class="add-form-submit"');
    });

    it('escapes name and localPath to prevent HTML injection', () => {
      const html = renderManagePanelHtml({
        rows: [
          {
            name: '<script>alert(1)</script>',
            localPath: '/home/dev/<x>',
            shortPath: 'dev/<x>',
            enabled: true,
          },
        ],
        isOpen: false,
      });

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;x&gt;');
    });

    it('marks the panel container with data-open reflecting isOpen', () => {
      const openHtml = renderManagePanelHtml({ rows: [], isOpen: true });
      const closedHtml = renderManagePanelHtml({ rows: [], isOpen: false });

      expect(openHtml).toContain('data-open="true"');
      expect(closedHtml).toContain('data-open="false"');
    });
  });

  describe('validateLocalPathInput', () => {
    it('rejects empty input with reason "empty"', () => {
      expect(validateLocalPathInput('')).toEqual({ ok: false, reason: 'empty' });
      expect(validateLocalPathInput('   ')).toEqual({ ok: false, reason: 'empty' });
    });

    it('rejects a relative path with reason "relative"', () => {
      expect(validateLocalPathInput('projects/app')).toEqual({ ok: false, reason: 'relative' });
    });

    it('accepts an absolute POSIX path', () => {
      expect(validateLocalPathInput('/home/dev/projects/my-app')).toEqual({ ok: true });
    });

    it('trims whitespace before validating', () => {
      expect(validateLocalPathInput('  /home/dev/projects/my-app  ')).toEqual({ ok: true });
    });
  });

  describe('buildOptimisticAddedRow', () => {
    it('shapes a row viewmodel from a repository entry', () => {
      const row = buildOptimisticAddedRow({
        name: 'new-app',
        localPath: '/home/dev/projects/new-app',
        enabled: true,
      });

      expect(row).toEqual({
        name: 'new-app',
        localPath: '/home/dev/projects/new-app',
        shortPath: 'projects/new-app',
        enabled: true,
      });
    });
  });
});
