# 3033: Reconcile the HTTP and transport website journey

- Status: completed
- Milestone: 30
- Packages: `apps/website`, HTTP, Hono Server, REST, GraphQL, GraphQL Yoga, GraphiQL, and Apollo Sandbox plugins
- Depends on: 3032
- ADR: retained transport decisions and any explicitly approved public changes from issues 3024 through 3030

## Goal

Make the public Fumadocs journey from the Fetch boundary to REST, GraphQL, and
browser explorers match the final simplified transport architecture.

## Acceptance criteria

- [x] Audit the `http-and-transports` and `api-explorers` ownership areas plus
      every affected page-level `sources` entry.
- [x] Update application identity, server ownership, credentials, Master,
      sessions, browser policy, REST paths and envelopes, GraphQL schemas and
      errors, Yoga, introspection, and explorer setup wherever contracts changed.
- [x] Preserve REST and GraphQL sibling ownership and show that both enter the
      same Runtime behavior without transport-specific authorization claims.
- [x] Verify Password Auth and Soft Delete examples across both transports and
      add migration notes for every explicitly approved public change.
- [x] Remove stale shared-server, route, header, operation, schema, and explorer
      examples while keeping the runnable application coherent.
- [x] Verify navigation, cross-links, page `sources`, code samples,
      accessibility, responsive layout, and light and dark themes.

## Tests

- [x] Website formatting, typecheck, content validation, build, link/source
      checks, and focused browser checks pass.

## Audit gate

- [x] Exercise the documented REST and GraphQL journeys and audit every claim
      against final source, packed exports, and browser behavior. Correct and
      repeat until no stale or missing step remains.
- [x] Record reviewed pages and documentation impact, including the public website.

## Out of scope

- Adding protocols, routes, schema fields, or explorer features.

## Website reconciliation and final audit

The ownership map and source metadata select 15 public pages, listed below.
Six pages receive corrections: HTTP, Hono, REST, GraphQL, Password Authentication
and Soft Delete. Reusable configuration exports no longer start the application
when Typegen loads it. One shared Hono entry point handles local Ctrl+C with
awaited disposal; direct GraphQL scripts own their start/dispose lifetime.
Existing-listener shutdown explains both owners. REST input/error shapes,
GraphQL error inspection, registry availability and explorer setup are explicit.
The default routes, headers, schemas, payloads, limits and security rules do not
change. No migration or new transport contract is introduced.

Executing literal samples revealed that the old Hono example lacked the database
provider required by UltimaBase.start(). The website and Hono README now supply
PostgreSQL explicitly. The GraphQL README's direct example receives the same
missing provider, bounded local exposure and awaited disposal. Soft Delete's
local walkthrough includes its protection acknowledgement and server entry point.
These are example repairs within the issue, not new capabilities or relaxed policy.

Validation: Prettier, all 66 website content checks (11.16 s), website TypeScript,
ESLint, production preview build and 32 browser checks (33.58 s) pass. A further
24 combinations cover all six edited pages at 375/1280 pixels in light/dark,
with no accessibility, overflow or client-error findings. Literal Hono/REST/
GraphQL configurations generate real Typegen declarations, typecheck against
built package exports, run on PostgreSQL 17 and close their managed listener on
SIGINT. REST query/default-disabled-write, HTTP identity, Yoga query/introspection,
direct GraphQL and external Hono survival after disposal checks pass. The first
Hono execution failed on the missing provider; the corrected complete run passes.

A second disposable PostgreSQL exercise runs the documented Password Auth and
Soft Delete REST/GraphQL flows: signup/login/refresh/logout, required signup
fields, user/session-only public results, tombstone hiding, repeated-delete
errors and absence of public restore/purge. Existing packed/browser explorer
contracts retain endpoint, identity, environment and introspection coverage;
this issue does not claim availability of the remote CDN at audit time.
The first six-page browser sweep found a light comment at 4.41:1 contrast on
the code tabs' tinted background. A focused global syntax-color correction and
an added GraphQL browser regression fix it without changing the content or theme
structure. The repeated complete sweep passes. All nine backlog checks pass
after handoff. Complete-diff re-audit is green.
Package production delta is zero: 127,096 lines and the retained exports remain.

Documentation impact: both. Public website journeys and the two package README
examples are corrected; engineering issue/plan records retain the audit evidence.

### Reviewed public pages

Paths below are relative to `apps/website/content/docs/1.0.0`:

- `core/runtime/api-errors.mdx`
- `guides/generate-types.mdx`
- `guides/test-an-application.mdx`
- `manual-installation.mdx`
- `operations/before-exposing-your-application.mdx`
- `operations/troubleshooting.mdx`
- `plugins/build-a-plugin/operations-and-graphql.mdx`
- `plugins/build-a-plugin/runtime-and-infrastructure.mdx`
- `plugins/official/graphql.mdx`
- `plugins/official/hono-server.mdx`
- `plugins/official/http.mdx`
- `plugins/official/password-authentication.mdx`
- `plugins/official/rest.mdx`
- `plugins/official/soft-delete.mdx`
- `reference/package-index.mdx`
