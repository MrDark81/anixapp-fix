'use strict';

/**
 * typescript-eslint пока не поддерживает TypeScript 7.
 * Устанавливаем TypeScript 5.9 в изолированном временном проекте и копируем
 * его рядом с @typescript-eslint/*, не затрагивая версию TypeScript приложения.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WANT = '5.9.3';
const PRIMARY = path.join(ROOT, 'node_modules', '@typescript-eslint', 'parser');
const TARGETS = [
  'node_modules/@typescript-eslint/parser',
  'node_modules/@typescript-eslint/typescript-estree',
  'node_modules/@typescript-eslint/eslint-plugin',
  'node_modules/@typescript-eslint/utils',
  'node_modules/@typescript-eslint/type-utils',
  'node_modules/@typescript-eslint/project-service',
  'node_modules/@typescript-eslint/tsconfig-utils',
  'node_modules/ts-api-utils',
];

function nestedVersion(pkgDir) {
  const pj = path.join(pkgDir, 'node_modules', 'typescript', 'package.json');
  if (!fs.existsSync(pj)) return null;
  try {
    return JSON.parse(fs.readFileSync(pj, 'utf8')).version;
  } catch {
    return null;
  }
}

function ensurePrimary() {
  if (!fs.existsSync(PRIMARY)) return false;
  const current = nestedVersion(PRIMARY);
  if (current && current.startsWith('5.')) return true;

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anixapp-eslint-typescript-'));
  try {
    fs.writeFileSync(
      path.join(tempRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'anixapp-eslint-typescript-bootstrap',
          version: '1.0.0',
          private: true,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    console.log(
      `[ensure-eslint-typescript] installing typescript@${WANT} in isolated temp directory`,
    );
    execSync(
      `npm install --prefix "${tempRoot}" typescript@${WANT} --no-save --no-audit --no-fund --legacy-peer-deps`,
      { cwd: tempRoot, stdio: 'inherit' },
    );

    const source = path.join(tempRoot, 'node_modules', 'typescript');
    const destination = path.join(PRIMARY, 'node_modules', 'typescript');
    if (!fs.existsSync(path.join(source, 'package.json'))) {
      throw new Error('Temporary TypeScript installation did not produce package.json.');
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.rmSync(destination, { recursive: true, force: true });
    fs.cpSync(source, destination, { recursive: true });
    console.log(`[ensure-eslint-typescript] installed typescript@${WANT} into parser`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return true;
}

function copyTo(targetRel) {
  const destRoot = path.join(ROOT, targetRel);
  if (!fs.existsSync(destRoot) || destRoot === PRIMARY) return;
  const current = nestedVersion(destRoot);
  if (current && current.startsWith('5.')) {
    console.log(`[ensure-eslint-typescript] ${targetRel} → typescript@${current}`);
    return;
  }
  const src = path.join(PRIMARY, 'node_modules', 'typescript');
  const dest = path.join(destRoot, 'node_modules', 'typescript');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[ensure-eslint-typescript] copied typescript@${WANT} → ${targetRel}`);
}

function main() {
  if (!fs.existsSync(path.join(ROOT, 'node_modules', '@typescript-eslint', 'parser'))) {
    console.log('[ensure-eslint-typescript] @typescript-eslint/parser not installed — skip');
    return;
  }
  if (!ensurePrimary()) return;
  for (const rel of TARGETS) copyTo(rel);
}

main();
