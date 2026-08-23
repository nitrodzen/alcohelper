type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let operationsSinceCleanup = 0;

function cleanupExpiredBuckets(now: number) {
  operationsSinceCleanup += 1;
  if (operationsSinceCleanup < 100 && buckets.size < 1_000) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
  operationsSinceCleanup = 0;
}

export function checkRateLimit(key: string, limit = 20, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  cleanupExpiredBuckets(now);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}

export function getClientIpFromHeaders(headers: Headers): string {
  const direct = headers.get("x-real-ip")?.trim();
  const forwardedValues = headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean);
  const forwarded = forwardedValues?.at(-1);
  const value = direct || forwarded || "unknown";
  return value.slice(0, 80);
}

export function getClientIp(request: Request): string {
  return getClientIpFromHeaders(request.headers);
}
