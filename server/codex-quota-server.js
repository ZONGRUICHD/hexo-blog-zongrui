const http = require("node:http");

const { createPublicQuotaPayload } = require("../lib/codex-quota.js");
const {
  createCachedQuotaReader,
} = require("../lib/codex-quota-source.js");

const API_PATH = "/api/codex-quota";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://zongtech.xyz",
  "https://www.zongtech.xyz",
  "https://hexo-blog-*-rzong773-3299s-projects.vercel.app",
  "https://zongruichd.github.io",
];

function parseAllowedOrigins(value = process.env.CODEX_QUOTA_ALLOWED_ORIGINS) {
  if (!value) return new Set(DEFAULT_ALLOWED_ORIGINS);
  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function offlinePayload() {
  return {
    text: "Codex 周额度同步暂时离线",
    remainingPercent: null,
    usedPercent: null,
    resetsAt: null,
    observedAt: null,
    stale: true,
    freshness: "offline",
  };
}

function writeJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(body);
}

function matchesAllowedOrigin(origin, pattern) {
  if (pattern === "*" || pattern === origin) return true;
  const wildcardIndex = pattern.indexOf("*");
  if (wildcardIndex < 0) return false;

  const prefix = pattern.slice(0, wildcardIndex);
  const suffix = pattern.slice(wildcardIndex + 1);
  return (
    origin.length >= prefix.length + suffix.length &&
    origin.startsWith(prefix) &&
    origin.endsWith(suffix)
  );
}

function corsHeaders(req, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return { Vary: "Origin" };

  const allowed = [...allowedOrigins].some((pattern) =>
    matchesAllowedOrigin(origin, pattern),
  );
  if (!allowed) {
    return null;
  }

  return {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigins.has("*") ? "*" : origin,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function methodNotAllowed(res, extraHeaders = {}) {
  writeJson(res, 405, { error: "Method not allowed" }, {
    Allow: "GET, OPTIONS",
    ...extraHeaders,
  });
}

async function handleApiRequest(req, res, options) {
  const cors = corsHeaders(req, options.allowedOrigins);
  if (cors === null) {
    writeJson(res, 403, { error: "Origin not allowed" }, { Vary: "Origin" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Cache-Control": "no-store", ...cors });
    res.end();
    return;
  }

  if (req.method !== "GET") {
    methodNotAllowed(res, cors);
    return;
  }

  try {
    const snapshot = await options.fetchSnapshot();
    const payload = createPublicQuotaPayload(snapshot, options.now());
    writeJson(res, 200, payload, {
      "Cache-Control":
        payload.freshness === "fresh" ? "public, max-age=60" : "no-store",
      ...cors,
    });
  } catch (error) {
    options.logger.error("Failed to read Codex quota snapshot:", error.message);
    writeJson(res, 200, offlinePayload(), cors);
  }
}

async function handleReadyRequest(req, res, options) {
  if (req.method !== "GET") {
    methodNotAllowed(res);
    return;
  }

  try {
    const snapshot = await options.fetchSnapshot();
    const freshness = createPublicQuotaPayload(snapshot, options.now()).freshness;
    if (freshness === "offline") {
      writeJson(res, 503, { ok: false, reason: "snapshot offline" });
      return;
    }
    writeJson(res, 200, { ok: true, freshness });
  } catch (error) {
    options.logger.error("Codex quota readiness check failed:", error.message);
    writeJson(res, 503, { ok: false, reason: "snapshot unavailable" });
  }
}

async function handleRequest(req, res, options) {
  const requestUrl = new URL(req.url || "/", "http://localhost");

  if (requestUrl.pathname === API_PATH) {
    await handleApiRequest(req, res, options);
    return;
  }

  if (requestUrl.pathname === "/healthz") {
    if (req.method !== "GET") {
      methodNotAllowed(res);
      return;
    }
    writeJson(res, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname === "/readyz") {
    await handleReadyRequest(req, res, options);
    return;
  }

  writeJson(res, 404, { error: "Not found" });
}

function createServer({
  allowedOrigins = parseAllowedOrigins(),
  fetchSnapshot = createCachedQuotaReader(),
  logger = console,
  now = () => new Date(),
} = {}) {
  const options = { allowedOrigins, fetchSnapshot, logger, now };
  const server = http.createServer((req, res) => {
    handleRequest(req, res, options).catch((error) => {
      logger.error("Unhandled Codex quota request error:", error.message);
      if (!res.headersSent) {
        writeJson(res, 500, { error: "Internal server error" });
      } else {
        res.destroy();
      }
    });
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.requestTimeout = 10_000;
  return server;
}

if (require.main === module) {
  const host = process.env.CODEX_QUOTA_HOST || "127.0.0.1";
  const port = Number(process.env.CODEX_QUOTA_PORT || 18731);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("CODEX_QUOTA_PORT must be a valid TCP port");
  }

  const server = createServer();
  server.listen(port, host, () => {
    console.log(`Codex quota API listening on http://${host}:${port}`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

module.exports = {
  API_PATH,
  DEFAULT_ALLOWED_ORIGINS,
  createServer,
  matchesAllowedOrigin,
  offlinePayload,
  parseAllowedOrigins,
};
