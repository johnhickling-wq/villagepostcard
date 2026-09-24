// Load game content from disk for Node tools (bot, validator, economy sim).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadContent } from '../../src/core/content.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadFromDisk() {
  return loadContent(async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8')));
}
