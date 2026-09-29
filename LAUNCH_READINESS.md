# Launch readiness operations

## Configuration

- Required everywhere: `DATABASE_URL`, `JWT_SECRET` (32+ characters).
- Required in production: `WEB_ORIGIN`, `APP_URL`.
- Public web configuration: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`.
- Optional mail delivery: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`.
- `UPLOAD_ROOT` is optional locally, but production must mount it on durable storage.

Production startup validates critical API configuration and exits without printing secret values when it is invalid.

## Isolated launch tests

`npm run test:launch` refuses to mutate any database except `shuk_launch_readiness_test`. It resets application tables in that database, creates declared test-only records, and runs API, authorization, session, idempotency, inventory, and order-workflow checks.

`npm run test:mobile` uses installed Microsoft Edge and the same isolated database to audit the six supported viewport sizes. Build the web app with the matching public API/site URLs before running it.

## Rate limiting

The current limiter implements the `RateLimitStore` interface, so a Redis-backed store can replace it without changing controllers. The active implementation is process-local memory:

- it resets when an API instance restarts;
- limits are not shared between instances;
- it is suitable for local development and a single instance only;
- multi-instance production requires a shared Redis implementation before horizontal scaling.

PostgreSQL and Redis containers exist in `docker-compose.yml`; Redis is not currently wired into application rate limiting.

## Observability

API responses expose `X-Request-Id`. Structured completion logs contain request ID, method, endpoint path, status, duration, and error category. Request bodies, query values, cookies, tokens, passwords, addresses, and secrets are not logged.
