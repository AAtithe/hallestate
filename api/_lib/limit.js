// Per-instance request limit for the form endpoints. It stops a stuck button
// or a casual script, not a determined attack; pair it with a Vercel Firewall
// rate limit on /api/.

const recent = new Map();

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
}

function tooMany(req, bucket, max = 5, windowMs = 10 * 60 * 1000) {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  recent.set(key, hits);
  return hits.length > max;
}

module.exports = { tooMany };
