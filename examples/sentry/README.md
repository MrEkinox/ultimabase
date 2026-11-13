# Sentry

Posts whose commit hook mails the followers, seen in Sentry
(`sentryPlugin()`): each query and hook a span of its request's trace, each
failed mail an issue.

- `src/instrument.ts`: `Sentry.init`, loaded before the application.
- `ultimabase.config.ts`: what `ultimabase dev` and `ultimabase start` run,
  Sentry first.
- `src/app.ts`: the posts, and the application.
- `src/app.test.ts`: Sentry's spans and issues, kept in memory.

`yarn start` serves it on http://localhost:3000, sending to the project
`SENTRY_DSN` names; `yarn vitest examples/sentry` runs its tests.
