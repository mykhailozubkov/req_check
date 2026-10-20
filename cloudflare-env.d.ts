declare namespace Cloudflare {
  interface Env {
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    ACCESS_ALLOWED_EMAIL_DOMAIN?: string;
    ASSETS?: Fetcher;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
