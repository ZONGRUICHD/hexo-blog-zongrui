const { validateQuotaSnapshot } = require("./codex-quota.js");

const DEFAULT_SOURCE_URL =
  "https://gist.githubusercontent.com/ZONGRUICHD/8292011e3b19e909282822590a696b8a/raw/codex-quota.json";

async function fetchQuotaSnapshot(
  sourceUrl = process.env.CODEX_QUOTA_SOURCE_URL || DEFAULT_SOURCE_URL,
  fetchImplementation = globalThis.fetch,
  now = Date.now(),
) {
  if (typeof fetchImplementation !== "function") {
    throw new Error("This runtime does not provide fetch");
  }

  const requestUrl = new URL(sourceUrl);
  requestUrl.searchParams.set("v", String(Math.floor(Number(now) / 60_000)));

  const response = await fetchImplementation(requestUrl.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "zongtech-codex-quota-home/2.0",
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Quota source returned HTTP ${response.status}`);
  }

  return validateQuotaSnapshot(await response.json());
}

function createCachedQuotaReader({
  fetchSnapshot = fetchQuotaSnapshot,
  now = Date.now,
  retryAfterMs = 5_000,
  ttlMs = 60_000,
} = {}) {
  if (typeof fetchSnapshot !== "function" || typeof now !== "function") {
    throw new Error("A snapshot reader and clock are required");
  }
  if (ttlMs < 1 || retryAfterMs < 1) {
    throw new Error("Cache intervals must be positive");
  }

  let cachedSnapshot = null;
  let lastError = null;
  let nextRefreshAt = 0;
  let refreshPromise = null;

  return async function readCachedQuotaSnapshot() {
    const currentTime = Number(now());
    if (currentTime < nextRefreshAt) {
      if (cachedSnapshot) return cachedSnapshot;
      if (lastError) throw lastError;
    }

    if (!refreshPromise) {
      refreshPromise = Promise.resolve()
        .then(() => fetchSnapshot())
        .then((snapshot) => {
          cachedSnapshot = snapshot;
          lastError = null;
          nextRefreshAt = Number(now()) + ttlMs;
          return snapshot;
        })
        .catch((error) => {
          lastError = error;
          nextRefreshAt = Number(now()) + retryAfterMs;
          if (!cachedSnapshot) throw error;
          return cachedSnapshot;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    return refreshPromise;
  };
}

module.exports = {
  DEFAULT_SOURCE_URL,
  createCachedQuotaReader,
  fetchQuotaSnapshot,
};
