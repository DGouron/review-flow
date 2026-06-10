#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCliArgs } from '@/cli/parseCliArgs.js';
import { executeDiscover, createDiscoverDependencies } from '@/main/commands/discover.command.js';
import {
  executeFollowupImportants,
  createFollowupImportantsDependencies,
} from '@/main/commands/followupImportants.command.js';
import { executeInit, createInitDependencies } from '@/main/commands/init.command.js';
import { executeLogs, createLogsDependencies } from '@/main/commands/logs.command.js';
import { executeSetup, createSetupDependencies } from '@/main/commands/setup.command.js';
import { executeStart, createStartDependencies } from '@/main/commands/start.command.js';
import { executeStatus, createStatusDependencies } from '@/main/commands/status.command.js';
import { executeStop, createStopDependencies } from '@/main/commands/stop.command.js';
import { executeValidate, createValidateDependencies } from '@/main/commands/validate.command.js';
import { readVersion, printHelp, getGitRemoteUrl } from '@/main/shared/cliConstants.js';
import { PID_FILE_PATH } from '@/shared/services/daemonPaths.js';
import {
  readPidFile,
  writePidFile,
  removePidFile,
  type PidFileDeps,
} from '@/shared/services/pidFileManager.js';
import { isProcessRunning } from '@/shared/services/processChecker.js';

function createPidFileDeps(): PidFileDeps {
  return {
    readPidFile: () => readPidFile(PID_FILE_PATH),
    writePidFile: (content) => writePidFile(PID_FILE_PATH, content),
    removePidFile: () => removePidFile(PID_FILE_PATH),
    isProcessRunning,
  };
}

const isDirectlyExecuted =
  process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);

if (isDirectlyExecuted) {
  const args = parseCliArgs(process.argv.slice(2));

  switch (args.command) {
    case 'version':
      console.log(readVersion());
      break;

    case 'help':
      printHelp();
      break;

    case 'start':
      executeStart(
        args.skipDependencyCheck,
        args.daemon,
        args.port,
        args.open,
        createStartDependencies(createPidFileDeps()),
      );
      break;

    case 'stop':
      executeStop(args.force, createStopDependencies(createPidFileDeps()));
      break;

    case 'status':
      executeStatus(args.json, createStatusDependencies(createPidFileDeps()));
      break;

    case 'logs':
      executeLogs(args.follow, args.lines, createLogsDependencies());
      break;

    case 'init':
      executeInit(
        args.yes,
        args.skipMcp,
        args.showSecrets,
        args.scanPaths,
        createInitDependencies(getGitRemoteUrl),
      );
      break;

    case 'discover':
      executeDiscover(args.scanPaths, args.maxDepth, createDiscoverDependencies(getGitRemoteUrl));
      break;

    case 'validate':
      executeValidate(args.fix, createValidateDependencies());
      break;

    case 'followup-importants':
      executeFollowupImportants(args.project, createFollowupImportantsDependencies());
      break;

    case 'setup':
      executeSetup(
        {
          path: args.path,
          json: args.json,
          force: args.force,
          ai: args.ai,
          yes: args.yes,
          showSecrets: args.showSecrets,
        },
        createSetupDependencies(),
      );
      break;
  }
}
