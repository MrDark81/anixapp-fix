#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fail(message) {
  console.error('[static-baseline] ERROR: ' + message);
  process.exit(2);
}

function normalizeFile(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  const match = normalized.match(/(?:^|\/)((?:src|electron|scripts)\/.+)$/i);
  return (match ? match[1] : normalized).replace(/^\/+/, '').toLowerCase();
}

function normalizeMessage(value) {
  return String(value || '').replace(/\s+\(ts\)$/, '').replace(/\s+/g, ' ').trim();
}

function signature(item, mode) {
  if (mode === 'eslint') {
    return JSON.stringify([
      normalizeFile(item.file),
      item.ruleId || '',
      String(item.message || '').replace(/\s+/g, ' ').trim(),
    ]);
  }
  return JSON.stringify([normalizeFile(item.file), normalizeMessage(item.message)]);
}

function compare(current, baseline, mode, reportedCount) {
  const currentCounts = new Map();
  for (const item of current) {
    const key = signature(item, mode);
    currentCounts.set(key, (currentCounts.get(key) || 0) + 1);
  }

  if (Number.isInteger(reportedCount) && current.length !== reportedCount) {
    fail('diagnostic parser found ' + current.length + ', but the tool reported ' + reportedCount + '; refusing to trust an incomplete baseline comparison');
  }

  const baselineCounts = new Map();
  for (const item of baseline.diagnostics || []) {
    const key = signature(item, mode);
    baselineCounts.set(key, (baselineCounts.get(key) || 0) + Number(item.count || 1));
  }

  const added = [];
  for (const [key, count] of currentCounts) {
    const allowed = baselineCounts.get(key) || 0;
    if (count > allowed) added.push({ signature: JSON.parse(key), count: count - allowed });
  }

  if (added.length) {
    console.error('[static-baseline] Found ' + added.length + ' new diagnostic signature(s) relative to ' + baseline.baselineRef + ':');
    for (const item of added) {
      const file = item.signature[0];
      const discriminator = mode === 'eslint' ? item.signature[1] : '';
      const message = mode === 'eslint' ? item.signature[2] : item.signature[1];
      console.error('  ' + file + (discriminator ? ' [' + discriminator + ']' : '') + ' — +' + item.count + ': ' + message);
    }
    process.exit(1);
  }

  console.log('[static-baseline] PASS: ' + current.length + ' ' + (mode === 'eslint' ? 'ESLint errors' : 'Svelte/TypeScript errors') + '; no new diagnostics versus ' + baseline.baselineRef + '.');
}

const mode = process.argv[2];
const baselinePath = process.argv[mode === 'svelte' ? 4 : 3];
if (!['svelte', 'eslint'].includes(mode) || !baselinePath) {
  fail('Usage: check-static-baseline.mjs svelte <svelte-check-log> <baseline.json> | eslint <baseline.json>');
}

let baseline;
try {
  baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
} catch (error) {
  fail('cannot read baseline ' + baselinePath + ': ' + (error instanceof Error ? error.message : String(error)));
}

if (mode === 'svelte') {
  const logPath = process.argv[3];
  let output;
  try {
    output = fs.readFileSync(logPath, 'utf8').replace(/^\uFEFF/, '').replace(/\u001b\[[0-9;]*m/g, '');
  } catch (error) {
    fail('cannot read svelte-check log ' + logPath + ': ' + (error instanceof Error ? error.message : String(error)));
  }

  const summary = output.match(/svelte-check found (\d+) errors? and (\d+) warnings?/i);
  if (!summary) fail('svelte-check summary is missing; the command may have crashed before diagnostics were produced');

  const lines = output.split(/\r?\n/);
  const diagnostics = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const normalizedLine = lines[i].replace(/\\/g, '/');
    const loc = normalizedLine.match(/(?:^|\/)((?:src|electron|scripts)\/.+?):\d+:\d+\s*$/i);
    const next = lines[i + 1] || '';
    if (!loc || !/\bError:/.test(next)) continue;

    diagnostics.push({
      file: normalizeFile(loc[1]),
      message: normalizeMessage(next.replace(/^.*?\bError:\s*/, '')),
    });
  }
  compare(diagnostics, baseline, mode, Number(summary[1]));
} else {
  const eslintCli = path.resolve('node_modules', 'eslint', 'bin', 'eslint.js');
  const result = spawnSync(process.execPath, [eslintCli, '.', '--format', 'json'], {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.error) fail('could not start ESLint: ' + result.error.message);

  let report;
  try {
    report = JSON.parse(result.stdout || '');
  } catch {
    fail('ESLint did not produce JSON output (exit ' + result.status + '); ' + String(result.stderr || '').slice(0, 500));
  }

  const diagnostics = [];
  let warningCount = 0;
  for (const fileResult of report) {
    const file = normalizeFile(fileResult.filePath);
    for (const message of fileResult.messages || []) {
      if (message.severity === 1) warningCount += 1;
      if (message.severity !== 2) continue;
      diagnostics.push({
        file,
        ruleId: message.ruleId || '',
        message: String(message.message || '').replace(/\s+/g, ' ').trim(),
      });
    }
  }
  console.log('[static-baseline] ESLint reported ' + diagnostics.length + ' errors and ' + warningCount + ' warnings.');
  compare(diagnostics, baseline, mode);
}
