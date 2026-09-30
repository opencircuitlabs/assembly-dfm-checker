#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { analyzeAssembly, centroidCsv, compareAudits, reportMarkdown, validateAssembly } from './index.js';
const raw = process.argv.slice(2); const [command, first, second] = raw; const option = (name) => { const index = raw.indexOf(`--${name}`); return index < 0 ? undefined : raw[index + 1]; };
const load = async (path) => JSON.parse(await readFile(path, 'utf8'));
const emit = async (value) => { const text = `${JSON.stringify(value, null, 2)}\n`; if (option('output')) await writeFile(option('output'), text); else process.stdout.write(text); };
try {
  if (!command || command === 'help') process.stdout.write('Usage: assembly-dfm-checker <validate|analyze|centroid|compare> <board-or-audit.json> [second.json] [--rules rules.json] [--output file] [--markdown file]\n');
  else if (command === 'validate' && first) { const result = validateAssembly(await load(first)); await emit(result); if (!result.valid) process.exitCode = 2; }
  else if (command === 'analyze' && first) {
    const rules = option('rules') ? await load(option('rules')) : {}; const result = analyzeAssembly(await load(first), rules); await emit(result);
    if (option('markdown')) await writeFile(option('markdown'), reportMarkdown(result)); if (!result.valid) process.exitCode = 3;
  } else if (command === 'centroid' && first) { const csv = centroidCsv(await load(first)); if (option('output')) await writeFile(option('output'), csv); else process.stdout.write(csv); }
  else if (command === 'compare' && first && second) await emit(compareAudits(await load(first), await load(second)));
  else throw new Error('invalid command or arguments');
} catch (error) { process.stderr.write(`assembly-dfm-checker: ${error.message}\n`); process.exitCode = 1; }
