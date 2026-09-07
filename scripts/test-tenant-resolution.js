/**
 * @file test-tenant-resolution.js
 * @brief Dry-run test for tenant config resolution in apps/web.
 *
 * Tests the /api/tenant/config endpoint across three axes:
 *   1. API-key resolution     → ?api_key=<key>      (highest priority)
 *   2. Host-header resolution → Host: <domain>      (fallback when no key)
 *   3. Tier override           → ?tier=<tier>        (dev-mode fallback)
 *   4. Default config          → no params          (always works)
 *
 * Tenants registered in route.ts:
 *   dev_demo_123  → Developer tier  (demo.deepcharts.io)
 *   pro_acme_456  → Pro tier        (trading.acme-capital.com)
 *   ent_global_789→ Enterprise tier   (terminal.global-macro.com)
 *
 * Usage:
 *   node scripts/test-tenant-resolution.js
 *   # Or against a specific host:
 *   TENANT_BASE_URL=http://localhost:3000 node scripts/test-tenant-resolution.js
 */

const BASE_URL = process.env.TENANT_BASE_URL || 'http://localhost:3000';

// ─── Test matrix ───────────────────────────────────────────────

/** Each row: description, query params, headers, expected tier. */
const TESTS = [
  // ── API key resolution ──
  {
    name: 'API key → Developer tier',
    params: { api_key: 'dev_demo_123' },
    headers: {},
    expectTier: 'Developer',
  },
  {
    name: 'API key → Pro tier',
    params: { api_key: 'pro_acme_456' },
    headers: {},
    expectTier: 'Pro',
  },
  {
    name: 'API key → Enterprise tier',
    params: { api_key: 'ent_global_789' },
    headers: {},
    expectTier: 'Enterprise',
  },
  {
    name: 'API key → unknown key → fallback default',
    params: { api_key: 'nonexistent_key_999' },
    headers: {},
    expectTier: 'Enterprise', // DEFAULT_TENANT_CONFIG is Enterprise
  },

  // ── Host-header resolution ──
  {
    name: 'Host header → Developer (demo.deepcharts.io)',
    params: {},
    headers: { host: 'demo.deepcharts.io', 'x-forwarded-host': 'demo.deepcharts.io' },
    expectTier: 'Developer',
  },
  {
    name: 'Host header → Pro (trading.acme-capital.com)',
    params: {},
    headers: { host: 'trading.acme-capital.com', 'x-forwarded-host': 'trading.acme-capital.com' },
    expectTier: 'Pro',
  },
  {
    name: 'Host header → Enterprise (terminal.global-macro.com)',
    params: {},
    headers: { host: 'terminal.global-macro.com', 'x-forwarded-host': 'terminal.global-macro.com' },
    expectTier: 'Enterprise',
  },
  {
    name: 'Host header → unknown domain → fallback default',
    params: {},
    headers: { host: 'unknown.example.com', 'x-forwarded-host': 'unknown.example.com' },
    expectTier: 'Enterprise',
  },

  // ── Tier override (dev mode) ──
  {
    name: 'Tier override ?tier=Pro (no key/domain)',
    params: { tier: 'Pro' },
    headers: {},
    expectTier: 'Pro',
  },
  {
    name: 'Tier override ?tier=Developer (no key/domain)',
    params: { tier: 'Developer' },
    headers: {},
    expectTier: 'Developer',
  },

  // ── API key takes priority over host header ──
  {
    name: 'API key priority over host header',
    params: { api_key: 'ent_global_789' },
    headers: { host: 'demo.deepcharts.io' }, // would be Developer if no key
    expectTier: 'Enterprise',
  },

  // ── Default (no params) ──
  {
    name: 'No params → default Enterprise config',
    params: {},
    headers: {},
    expectTier: 'Enterprise',
  },
];

// ─── Runner ────────────────────────────────────────────────────

async function runTest(test) {
  const url = new URL('/api/tenant/config', BASE_URL);
  Object.entries(test.params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...test.headers },
    });

    if (!res.ok) {
      return {
        ...test,
        pass: false,
        reason: `HTTP ${res.status}`,
        actual: null,
      };
    }

    const config = await res.json();
    const actualTier = config.tier;
    const pass = actualTier === test.expectTier;

    return {
      ...test,
      pass,
      actual: actualTier,
      reason: pass
        ? 'Tier matches'
        : `Expected ${test.expectTier}, got ${actualTier}`,
    };
  } catch (e) {
    return {
      ...test,
      pass: false,
      actual: null,
      reason: `Network error: ${e.message}`,
    };
  }
}

async function main() {
  console.log('═══ Tenant Resolution Dry Run ═══');
  console.log(`Target: ${BASE_URL}/api/tenant/config\n`);

  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    const result = await runTest(test);
    const icon = result.pass ? '✅' : '❌';
    console.log(`${icon} ${test.name}`);
    console.log(`   ${result.reason}` +
      (result.actual ? ` (got: ${result.actual})` : ''));

    if (result.pass) passed++;
    else failed++;
  }

  // ── Feature flag verification ──
  console.log('\n═══ Feature Flag Spot-Check ═══\n');

  const devRes = await runTest(TESTS[0]); // Developer
  const proRes = await runTest(TESTS[1]); // Pro
  const entRes = await runTest(TESTS[2]); // Enterprise

  for (const [label, res] of [['Developer', devRes], ['Pro', proRes], ['Enterprise', entRes]]) {
    const tier = res.actual || 'null';
    console.log(`${label} tier resolved: ${tier}`);
  }

  // ── Summary ──
  const total = passed + failed;
  console.log(`\n═══ Results: ${passed}/${total} passed ═══`);

  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
