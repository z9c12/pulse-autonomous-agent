const IS_PROD = process.env.NODE_ENV === "production";

function redact(msg: string): string {
  // Strip anything that looks like a key, token, or connection string
  return msg
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/apikey[=:]\s*\S+/gi, "apikey=[REDACTED]")
    .replace(/password[=:]\s*\S+/gi, "password=[REDACTED]")
    .replace(/secret[=:]\s*\S+/gi, "secret=[REDACTED]");
}

export const logger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (context: string, err?: unknown) => {
    if (IS_PROD) {
      // In production only log a safe summary — never raw error objects
      const summary =
        err instanceof Error
          ? redact(err.message).slice(0, 80)
          : typeof err === "string"
          ? redact(err).slice(0, 80)
          : "";
      console.error(`[ERROR] ${context}${summary ? ` — ${summary}` : ""}`);
    } else {
      console.error(`[ERROR] ${context}`, err);
    }
  },
};
