const WEEK_WINDOW_MINUTES = 7 * 24 * 60;
const STALE_AFTER_MS = 15 * 60 * 1000;
const OFFLINE_AFTER_MS = 24 * 60 * 60 * 1000;

function firstDefined(object, names) {
  for (const name of names) {
    if (object && object[name] !== undefined && object[name] !== null) {
      return object[name];
    }
  }
  return null;
}

function selectWeeklyWindow(response) {
  const payload = response && response.result ? response.result : response;
  const buckets = firstDefined(payload, [
    "rateLimitsByLimitId",
    "rate_limits_by_limit_id",
  ]);
  const defaultBucket = firstDefined(payload, ["rateLimits", "rate_limits"]);
  const codexBucket = (buckets && (buckets.codex || buckets["codex"])) || defaultBucket;

  if (!codexBucket || typeof codexBucket !== "object") {
    throw new Error("Codex rate-limit response did not include the codex bucket");
  }

  for (const name of ["primary", "secondary"]) {
    const window = codexBucket[name];
    if (!window || typeof window !== "object") continue;

    const windowMinutes = Number(
      firstDefined(window, ["windowDurationMins", "window_minutes"]),
    );
    if (windowMinutes !== WEEK_WINDOW_MINUTES) continue;

    const usedPercent = Number(
      firstDefined(window, ["usedPercent", "used_percent"]),
    );
    const resetsAt = Number(firstDefined(window, ["resetsAt", "resets_at"]));
    if (!Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100) {
      throw new Error("Codex weekly rate-limit percentage is invalid");
    }

    return {
      usedPercent: Math.round(usedPercent),
      remainingPercent: Math.max(0, 100 - Math.round(usedPercent)),
      resetsAt: Number.isFinite(resetsAt) && resetsAt > 0 ? resetsAt : null,
      windowMinutes,
    };
  }

  throw new Error("Codex rate-limit response did not include a 7-day window");
}

function createQuotaSnapshot(response, observedAt = new Date()) {
  const weekly = selectWeeklyWindow(response);
  return {
    schemaVersion: 1,
    remainingPercent: weekly.remainingPercent,
    usedPercent: weekly.usedPercent,
    windowMinutes: weekly.windowMinutes,
    resetsAt: weekly.resetsAt
      ? new Date(weekly.resetsAt * 1000).toISOString()
      : null,
    observedAt: new Date(observedAt).toISOString(),
  };
}

function validateQuotaSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Quota snapshot must be an object");
  }

  const schemaVersion = Number(snapshot.schemaVersion);
  const remainingPercent = Number(snapshot.remainingPercent);
  const usedPercent = Number(snapshot.usedPercent);
  const windowMinutes = Number(snapshot.windowMinutes);
  const observedAtMs = Date.parse(snapshot.observedAt);
  const resetsAtMs = snapshot.resetsAt ? Date.parse(snapshot.resetsAt) : null;

  if (
    schemaVersion !== 1 ||
    !Number.isFinite(remainingPercent) ||
    !Number.isInteger(remainingPercent) ||
    remainingPercent < 0 ||
    remainingPercent > 100 ||
    !Number.isFinite(usedPercent) ||
    !Number.isInteger(usedPercent) ||
    usedPercent < 0 ||
    usedPercent > 100 ||
    remainingPercent + usedPercent !== 100 ||
    windowMinutes !== WEEK_WINDOW_MINUTES ||
    !Number.isFinite(observedAtMs) ||
    (resetsAtMs !== null && !Number.isFinite(resetsAtMs))
  ) {
    throw new Error("Quota snapshot is invalid");
  }

  return {
    schemaVersion: 1,
    remainingPercent: Math.round(remainingPercent),
    usedPercent: Math.round(usedPercent),
    windowMinutes,
    resetsAt: resetsAtMs === null ? null : new Date(resetsAtMs).toISOString(),
    observedAt: new Date(observedAtMs).toISOString(),
  };
}

function formatShanghaiDateTime(value) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${Number(values.month)}月${Number(values.day)}日 ${values.hour}:${values.minute}`;
}

function createPublicQuotaPayload(snapshot, now = new Date()) {
  const clean = validateQuotaSnapshot(snapshot);
  const nowMs = new Date(now).getTime();
  const observedAtMs = Date.parse(clean.observedAt);

  if (!Number.isFinite(nowMs) || observedAtMs - nowMs > 5 * 60 * 1000) {
    throw new Error("Quota snapshot timestamp is in the future");
  }

  const ageMs = Math.max(0, nowMs - observedAtMs);
  const resetLabel = clean.resetsAt
    ? ` · ${formatShanghaiDateTime(clean.resetsAt)} 重置`
    : "";
  let freshness = "fresh";
  let text = `Codex 周额度剩余 ${clean.remainingPercent}%${resetLabel}`;

  if (ageMs > OFFLINE_AFTER_MS) {
    freshness = "offline";
    text = "Codex 周额度同步暂时离线";
  } else if (ageMs > STALE_AFTER_MS) {
    freshness = "stale";
    text = `Codex 周额度约剩 ${clean.remainingPercent}% · ${formatShanghaiDateTime(clean.observedAt)} 同步`;
  }

  return {
    text,
    remainingPercent: freshness === "offline" ? null : clean.remainingPercent,
    usedPercent: freshness === "offline" ? null : clean.usedPercent,
    resetsAt: freshness === "offline" ? null : clean.resetsAt,
    observedAt: clean.observedAt,
    stale: freshness !== "fresh",
    freshness,
  };
}

module.exports = {
  OFFLINE_AFTER_MS,
  STALE_AFTER_MS,
  WEEK_WINDOW_MINUTES,
  createPublicQuotaPayload,
  createQuotaSnapshot,
  formatShanghaiDateTime,
  selectWeeklyWindow,
  validateQuotaSnapshot,
};
