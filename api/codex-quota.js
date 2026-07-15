const {
  createPublicQuotaPayload,
  validateQuotaSnapshot,
} = require("../lib/codex-quota.js");

const DEFAULT_SOURCE_URL =
  "https://gist.githubusercontent.com/ZONGRUICHD/8292011e3b19e909282822590a696b8a/raw/codex-quota.json";

async function fetchQuotaSnapshot(
  sourceUrl = process.env.CODEX_QUOTA_SOURCE_URL || DEFAULT_SOURCE_URL,
  fetchImplementation = globalThis.fetch,
) {
  if (typeof fetchImplementation !== "function") {
    throw new Error("This runtime does not provide fetch");
  }

  const separator = sourceUrl.includes("?") ? "&" : "?";
  const cacheKey = Math.floor(Date.now() / 60_000);
  const response = await fetchImplementation(`${sourceUrl}${separator}v=${cacheKey}`, {
    headers: { "User-Agent": "zongtech-codex-quota/1.0" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Quota source returned HTTP ${response.status}`);
  }
  return validateQuotaSnapshot(await response.json());
}

function setPublicHeaders(res, cacheControl) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
}

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setPublicHeaders(res, "public, max-age=86400");
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    setPublicHeaders(res, "no-store");
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const snapshot = await fetchQuotaSnapshot();
    const payload = createPublicQuotaPayload(snapshot);
    setPublicHeaders(res, "public, s-maxage=60");
    return res.status(200).json(payload);
  } catch (error) {
    console.error("Failed to read Codex quota snapshot:", error.message);
    setPublicHeaders(res, "no-store");
    return res.status(200).json({
      text: "Codex 周额度同步暂时离线",
      remainingPercent: null,
      usedPercent: null,
      resetsAt: null,
      observedAt: null,
      stale: true,
      freshness: "offline",
    });
  }
}

module.exports = handler;
module.exports.DEFAULT_SOURCE_URL = DEFAULT_SOURCE_URL;
module.exports.fetchQuotaSnapshot = fetchQuotaSnapshot;
