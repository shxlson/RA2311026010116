import type { Level, LogResult, LoggerConfig, PackageName, Stack } from "./types.js";

type AuthToken = {
  token: string;
  expiresAt: number;
};

const DEFAULT_BASE_URL = "http://20.207.122.201/evaluation-service";
const DEFAULT_TOKEN_CACHE_MS = 10 * 60 * 1000;

const getAuthToken = async (config: LoggerConfig): Promise<AuthToken> => {
  const url = `${config.baseUrl ?? DEFAULT_BASE_URL}/auth`;
  const body = {
    email: config.email,
    name: config.name,
    rollNo: config.rollNo,
    accessCode: config.accessCode,
    clientID: config.clientId,
    clientSecret: config.clientSecret
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`auth failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const token =
    (typeof data.access_token === "string" && data.access_token) ||
    (typeof data.token === "string" && data.token);

  if (!token) {
    throw new Error("auth response missing token");
  }

  const ttl =
    typeof data.expires_in === "number" && Number.isFinite(data.expires_in)
      ? data.expires_in * 1000
      : config.tokenCacheMs ?? DEFAULT_TOKEN_CACHE_MS;

  return { token, expiresAt: Date.now() + ttl };
};

export const createLogger = (config: LoggerConfig) => {
  let cached: AuthToken | null = null;

  const getToken = async (): Promise<string> => {
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    cached = await getAuthToken(config);
    return cached.token;
  };

  const log = async (
    stack: Stack,
    level: Level,
    packageName: PackageName,
    message: string
  ): Promise<LogResult> => {
    const url = `${config.baseUrl ?? DEFAULT_BASE_URL}/logs`;
    const token = await getToken();

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        stack,
        level,
        package: packageName,
        message
      })
    });

    if (res.status === 401) {
      cached = null;
      const freshToken = await getToken();
      const retry = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshToken}`
        },
        body: JSON.stringify({
          stack,
          level,
          package: packageName,
          message
        })
      });

      if (!retry.ok) {
        const text = await retry.text();
        throw new Error(`log failed: ${retry.status} ${text}`);
      }

      return (await retry.json()) as LogResult;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`log failed: ${res.status} ${text}`);
    }

    return (await res.json()) as LogResult;
  };

  return { log };
};
