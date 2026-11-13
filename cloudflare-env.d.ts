declare namespace Cloudflare {
  interface Env {
    OPENROUTER_API_KEY?: string;
    AI_RATE_LIMITER?: RateLimit;
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    ACCESS_ALLOWED_EMAIL_DOMAIN?: string;
    ASSETS?: Fetcher;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
