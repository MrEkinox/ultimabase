---
'ultimabase': minor
---

An error line with an `err`, logged by the application's code or a plugin, as `logger.error({ err: error }, 'The join failed.')`, gets a `correlationId` unless it has one and is published on `ultimabase:error`, as the kernel's failures are: with `sentryPlugin()` it is a Sentry issue, with no `Sentry.captureException` beside it (D-381).
