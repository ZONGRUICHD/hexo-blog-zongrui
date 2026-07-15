const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPublicQuotaPayload,
  createQuotaSnapshot,
  selectWeeklyWindow,
} = require("../lib/codex-quota.js");
const {
  DEFAULT_SOURCE_URL,
  fetchQuotaSnapshot,
} = require("../api/codex-quota.js");

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

test("the Vercel reader accepts only the sanitized snapshot shape", async () => {
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
