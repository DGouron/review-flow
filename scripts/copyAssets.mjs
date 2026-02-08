import { cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(rootDir, 'src', 'interface-adapters', 'views', 'dashboard');
const target = join(rootDir, 'dist', 'interface-adapters', 'views', 'dashboard');

mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });
