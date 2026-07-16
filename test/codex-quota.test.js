const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");

const {
  createPublicQuotaPayload,
  createQuotaSnapshot,
  selectWeeklyWindow,
  validateQuotaSnapshot,
} = require("../lib/codex-quota.js");
const {
  DEFAULT_SOURCE_URL,
  createCachedQuotaReader,
  fetchQuotaSnapshot,
} = require("../lib/codex-quota-source.js");
const {
  createServer,
  matchesAllowedOrigin,
  parseAllowedOrigins,
} = require("../server/codex-quota-server.js");

test("selects a weekly primary window and converts used to remaining", () => {
  const response = {
    rateLimitsByLimitId: {
      codex: {
        primary: {
          usedPercent: 5,
          windowDurationMins: 10080,
          resetsAt: 1784666131,
        },
        secondary: null,
      },
    },
  };

  assert.deepEqual(selectWeeklyWindow(response), {
    usedPercent: 5,
    remainingPercent: 95,
    resetsAt: 1784666131,
    windowMinutes: 10080,
  });
});

test("finds a weekly secondary window in legacy snake-case payloads", () => {
  const response = {
    rate_limits: {
      primary: { used_percent: 20, window_minutes: 300, resets_at: 1 },
      secondary: {
        used_percent: 37,
        window_minutes: 10080,
        resets_at: 1784666131,
      },
    },
  };

  assert.equal(selectWeeklyWindow(response).remainingPercent, 63);
});

test("creates only the sanitized quota snapshot fields", () => {
  const snapshot = createQuotaSnapshot(
    {
      rateLimits: {
        primary: {
          usedPercent: 4,
          windowDurationMins: 10080,
          resetsAt: 1784666131,
        },
      },
      planType: "private-plan-value",
      credits: { balance: "private" },
    },
    "2026-07-15T10:00:00.000Z",
  );

  assert.deepEqual(Object.keys(snapshot), [
    "schemaVersion",
    "remainingPercent",
    "usedPercent",
    "windowMinutes",
    "resetsAt",
    "observedAt",
  ]);
  assert.equal(snapshot.remainingPercent, 96);
  assert.equal(JSON.stringify(snapshot).includes("private"), false);
});

test("formats fresh, stale, and offline public text honestly", () => {
  const snapshot = {
    schemaVersion: 1,
    remainingPercent: 95,
    usedPercent: 5,
    windowMinutes: 10080,
    resetsAt: "2026-07-21T20:35:31.000Z",
    observedAt: "2026-07-15T10:00:00.000Z",
  };

  const fresh = createPublicQuotaPayload(snapshot, "2026-07-15T10:05:00.000Z");
  assert.equal(fresh.text, "Codex 周额度剩余 95% · 7月22日 04:35 重置");
  assert.equal(fresh.freshness, "fresh");

  const stale = createPublicQuotaPayload(snapshot, "2026-07-15T10:20:00.000Z");
  assert.equal(stale.text, "Codex 周额度约剩 95% · 7月15日 18:00 同步");
  assert.equal(stale.freshness, "stale");

  const offline = createPublicQuotaPayload(snapshot, "2026-07-16T10:01:00.000Z");
  assert.equal(offline.text, "Codex 周额度同步暂时离线");
  assert.equal(offline.remainingPercent, null);
  assert.equal(offline.freshness, "offline");
});

test("the snapshot reader accepts only the sanitized snapshot shape", async () => {
  let requestedUrl = "";
  const snapshot = await fetchQuotaSnapshot(DEFAULT_SOURCE_URL, async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      async json() {
        return {
          schemaVersion: 1,
          remainingPercent: 94,
          usedPercent: 6,
          windowMinutes: 10080,
          resetsAt: "2026-07-21T20:35:31.000Z",
          observedAt: "2026-07-15T11:00:38.079Z",
        };
      },
    };
  });

  assert.match(requestedUrl, /codex-quota\.json\?v=\d+$/);
  assert.equal(snapshot.remainingPercent, 94);
});

test("rejects unknown or internally inconsistent snapshot schemas", () => {
  const valid = {
    schemaVersion: 1,
    remainingPercent: 95,
    usedPercent: 5,
    windowMinutes: 10080,
    resetsAt: "2026-07-21T20:35:31.000Z",
    observedAt: "2026-07-15T10:00:00.000Z",
  };

  assert.throws(
    () => validateQuotaSnapshot({ ...valid, schemaVersion: 999 }),
    /invalid/,
  );
  assert.throws(
    () =>
      validateQuotaSnapshot({
        ...valid,
        remainingPercent: 90,
        usedPercent: 90,
      }),
    /invalid/,
  );
});

test("the snapshot reader coalesces refreshes and serves cached data on errors", async () => {
  let currentTime = 0;
  let calls = 0;
  let shouldFail = false;
  const snapshot = { remainingPercent: 91 };
  const readSnapshot = createCachedQuotaReader({
    fetchSnapshot: async () => {
      calls += 1;
      if (shouldFail) throw new Error("temporary failure");
      return snapshot;
    },
    now: () => currentTime,
    retryAfterMs: 5_000,
    ttlMs: 60_000,
  });

  const concurrent = await Promise.all([readSnapshot(), readSnapshot()]);
  assert.deepEqual(concurrent, [snapshot, snapshot]);
  assert.equal(calls, 1);

  currentTime = 60_000;
  shouldFail = true;
  assert.equal(await readSnapshot(), snapshot);
  assert.equal(calls, 2);

  currentTime = 61_000;
  assert.equal(await readSnapshot(), snapshot);
  assert.equal(calls, 2);
});

test("the snapshot reader briefly negative-caches an initial failure", async () => {
  let currentTime = 0;
  let calls = 0;
  const error = new Error("temporary failure");
  const readSnapshot = createCachedQuotaReader({
    fetchSnapshot: async () => {
      calls += 1;
      throw error;
    },
    now: () => currentTime,
    retryAfterMs: 5_000,
  });

  await assert.rejects(readSnapshot(), error);
  currentTime = 1_000;
  await assert.rejects(readSnapshot(), error);
  assert.equal(calls, 1);

  currentTime = 5_000;
  await assert.rejects(readSnapshot(), error);
  assert.equal(calls, 2);
});

async function withQuotaServer(options, callback) {
  const server = createServer(options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("the standalone API serves health, readiness, CORS, and quota data", async () => {
  const snapshot = {
    schemaVersion: 1,
    remainingPercent: 93,
    usedPercent: 7,
    windowMinutes: 10080,
    resetsAt: "2026-07-21T20:35:31.000Z",
    observedAt: "2026-07-15T10:00:00.000Z",
  };

  await withQuotaServer(
    {
      allowedOrigins: parseAllowedOrigins("https://zongtech.xyz"),
      fetchSnapshot: async () => snapshot,
      logger: { error() {} },
      now: () => new Date("2026-07-15T10:05:00.000Z"),
    },
    async (baseUrl) => {
      const health = await fetch(`${baseUrl}/healthz`);
      assert.equal(health.status, 200);
      assert.equal(health.headers.get("cache-control"), "no-store");
      assert.deepEqual(await health.json(), { ok: true });

      const ready = await fetch(`${baseUrl}/readyz`);
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { ok: true, freshness: "fresh" });

      const api = await fetch(`${baseUrl}/api/codex-quota`, {
        headers: { Origin: "https://zongtech.xyz" },
      });
      const payload = await api.json();
      assert.equal(api.status, 200);
      assert.equal(
        api.headers.get("access-control-allow-origin"),
        "https://zongtech.xyz",
      );
      assert.equal(api.headers.get("cache-control"), "public, max-age=60");
      assert.equal(api.headers.get("vary"), "Origin");
      assert.equal(payload.remainingPercent, 93);
      assert.equal(payload.freshness, "fresh");

      const preflight = await fetch(`${baseUrl}/api/codex-quota`, {
        method: "OPTIONS",
        headers: { Origin: "https://zongtech.xyz" },
      });
      assert.equal(preflight.status, 204);
      assert.equal(
        preflight.headers.get("access-control-allow-methods"),
        "GET, OPTIONS",
      );

      const disallowed = await fetch(`${baseUrl}/api/codex-quota`, {
        headers: { Origin: "https://example.com" },
      });
      assert.equal(disallowed.status, 403);

      const wrongMethod = await fetch(`${baseUrl}/api/codex-quota`, {
        method: "POST",
        headers: { Origin: "https://zongtech.xyz" },
      });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get("allow"), "GET, OPTIONS");
    },
  );
});

test("the CORS matcher supports only configured deployment preview patterns", () => {
  const pattern = "https://hexo-blog-*-rzong773-3299s-projects.vercel.app";
  assert.equal(
    matchesAllowedOrigin(
      "https://hexo-blog-preview-rzong773-3299s-projects.vercel.app",
      pattern,
    ),
    true,
  );
  assert.equal(
    matchesAllowedOrigin("https://hexo-blog-preview-attacker.vercel.app", pattern),
    false,
  );
});

test("the standalone API degrades safely when the snapshot is unavailable", async () => {
  await withQuotaServer(
    {
      fetchSnapshot: async () => {
        throw new Error("upstream unavailable");
      },
      logger: { error() {} },
    },
    async (baseUrl) => {
      const api = await fetch(`${baseUrl}/api/codex-quota`);
      const payload = await api.json();
      assert.equal(api.status, 200);
      assert.equal(api.headers.get("cache-control"), "no-store");
      assert.equal(payload.freshness, "offline");
      assert.equal(payload.remainingPercent, null);

      const ready = await fetch(`${baseUrl}/readyz`);
      assert.equal(ready.status, 503);
      assert.deepEqual(await ready.json(), {
        ok: false,
        reason: "snapshot unavailable",
      });
    },
  );
});
