const ADMIN_USER = "paper";

export type AdminAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; reason: string };

export function verifyAdminRequest(
  request: Request,
  password = process.env.SITE_PASSWORD,
): AdminAuthResult {
  if (!password) {
    return { ok: false, status: 503, reason: "Site password is not configured" };
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) {
    return { ok: false, status: 401, reason: "Authentication required" };
  }

  let credentials: string;
  try {
    credentials = atob(authorization.slice(6));
  } catch {
    return { ok: false, status: 401, reason: "Authentication required" };
  }

  if (!constantTimeEqual(credentials, `${ADMIN_USER}:${password}`)) {
    return { ok: false, status: 401, reason: "Authentication required" };
  }

  if (request.method !== "GET" && !isSameOrigin(request)) {
    return { ok: false, status: 403, reason: "Cross-origin request rejected" };
  }

  return { ok: true };
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
