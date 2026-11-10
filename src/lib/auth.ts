import { kst } from "@/lib/kst";

const AUTH_SECRET_KEY = "moneynote-session-v1";

const encoder = new TextEncoder();

const sha256 = async (data: string): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const createToken = async (password: string): Promise<string> => {
  const payload = JSON.stringify({ authed: true, ts: kst().valueOf() });
  const payloadBase64 = btoa(payload);
  const signature = await sha256(`${payloadBase64}.${password}.${AUTH_SECRET_KEY}`);
  return `${payloadBase64}.${signature}`;
};

export const verifyToken = async (token: string): Promise<boolean> => {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;

    const [payloadBase64, signature] = parts;
    const expectedSignature = await sha256(
      `${payloadBase64}.${process.env.SITE_PASSWORD}.${AUTH_SECRET_KEY}`
    );

    if (signature !== expectedSignature) return false;

    const payload = JSON.parse(atob(payloadBase64));

    if (!payload.authed) return false;

    // Token expires after 24 hours
    if (kst().valueOf() - payload.ts > 24 * 60 * 60 * 1000) return false;

    return true;
  } catch {
    return false;
  }
};

export const getTokenFromRequest = (req: Request): string | null => {
  return req.headers.get("x-auth-token");
};

export const requireAuth = async (req: Request): Promise<Response | null> => {
  const token = getTokenFromRequest(req);
  if (!token || !(await verifyToken(token))) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  return null;
};
