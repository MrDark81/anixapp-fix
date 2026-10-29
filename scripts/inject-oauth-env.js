/**
 * Вшивает секреты main-process в пакет Electron (runtime не видит CI env / .env).
 * Источник: process.env или anixapp/.env.
 *
 * Для тестовой сборки без секретов можно задать ANIXAPP_TEST_BUILD=1.
 * В этом режиме отсутствующие ключи остаются пустыми; OAuth/proxy в таком пакете
 * не будут работать. Обычные сборки по-прежнему требуют оба ключа.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadLocalEnv } = require('../electron/lib/load-dotenv');

loadLocalEnv();

const firebaseKey = String(process.env.FIREBASE_API_KEY || '').trim();
const proxyKey = String(
  process.env.ANIXART_PROXY_APP_KEY || process.env.ANIXAPP_PROXY_KEY || '',
).trim();
const isTestBuild = process.env.ANIXAPP_TEST_BUILD === '1';

if (!firebaseKey && !isTestBuild) {
  console.error(
    'FIREBASE_API_KEY отсутствует. Добавьте его в .env или в GitHub Actions secret FIREBASE_API_KEY.',
  );
  process.exit(1);
}

if (!proxyKey && !isTestBuild) {
  console.error(
    'ANIXART_PROXY_APP_KEY отсутствует. Добавьте его в .env или в GitHub Actions secret ANIXART_PROXY_APP_KEY.',
  );
  process.exit(1);
}

if (isTestBuild && (!firebaseKey || !proxyKey)) {
  console.warn(
    'ANIXAPP_TEST_BUILD=1: сборка продолжится без OAuth/proxy секретов; авторизация и резервный прокси могут быть недоступны.',
  );
}

const dest = path.join(__dirname, '..', 'electron', 'lib', 'oauth-env.generated.js');
const body =
  `'use strict';\\n` +
  `module.exports = ${JSON.stringify(
    {
      FIREBASE_API_KEY: firebaseKey,
      ANIXART_PROXY_APP_KEY: proxyKey,
    },
    null,
    2,
  )};\\n`;
fs.writeFileSync(dest, body, 'utf8');
console.log('oauth-env.generated.js записан (FIREBASE_API_KEY, ANIXART_PROXY_APP_KEY)');
