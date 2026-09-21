# 3032: Reconcile the data, security, and persistence website journey

- Status: completed
- Milestone: 30
- Packages: `apps/website`, Access, Hooks, Validation, Roles, ACL Permissions, Password Auth, Soft Delete, PostgreSQL, and PostgreSQL Vector plugins
- Depends on: 3031
- ADR: retained plugin decisions and any explicitly approved public changes from issues 3015 through 3023

## Goal

Make the public Fumadocs journey through persistence, lifecycle, validation,
identity, authorization, and optional data behavior match the simplified
plugins and their exact ownership boundaries.

## Acceptance criteria

- [x] Audit the `postgresql`, `optional-data-behavior`,
      `validation-and-lifecycle`, and `authentication-and-authorization`
      ownership areas plus every affected page-level `sources` entry.
- [x] Verify installation, schema options, ordering, security defaults, Master,
      sessions, policy composition, transactions, examples, REST and GraphQL
      usage, limitations, and troubleshooting against final source behavior.
- [x] Explain plugin independence clearly: Access and ACL, identity and
      authorization, Hooks and validation, Soft Delete and transports, and
      PostgreSQL and logical Core behavior must not blur ownership.
- [x] Remove stale APIs and duplicated explanations, preserve runnable examples,
      and add migration notes for every explicitly approved public change.
- [x] Verify navigation, cross-links, page `sources`, code samples,
      accessibility, responsive layout, and light and dark themes.

## Tests

- [x] Website formatting, typecheck, content validation, build, link/source
      checks, and focused browser checks pass.

## Audit gate

- [x] Read the complete journey as an application developer and audit every
      claim against final source, packed exports, and public transport behavior.
      Correct and repeat until no stale or missing step remains.
- [x] Record reviewed pages and Documentation impact: public website
      documentation.

## Out of scope

- Adding the paused ACL or Soft Delete features.

## Website reconciliation and final audit

The ownership map and source metadata select 26 pages, listed below. Nine MDX
pages receive focused corrections. Exported configuration modules no longer
start applications during Typegen loading; the maintenance example owns startup
and awaited disposal in its entry point. The Vector example uses pure compilation.
Password Authentication distinguishes read policy from nonexistent read Hooks.
Soft Delete explicitly documents selectable/filterable isDeleted without granting
access to tombstones. The suspended features remain absent.

The Roles journey now supplies the missing attributed User read policy. Its
read fallback and narrowing provider are installed together: only the session
owner reads its User, Role/Post retain their stated reads, and other schemas
remain denied. A disposable PostgreSQL 17 exercise extracts the three literal
MDX modules, generates real Typegen declarations, typechecks built exports and
verifies signup/login, own-profile isolation, public Post reads, rejection of a
non-member update, and success after Editor membership. The literal Vector
sample also compiles while another application is active without claiming its slot.

Browser review found two existing accessibility defects: dark Shiki comments
had 4.11:1 contrast and wide tables could not be reached by keyboard. The existing
landing comment correction now applies globally; a small MDX table wrapper makes
the scroll region focusable. Two browser regression cases cover those pages and
exercise actual ArrowRight scrolling. No API, plugin behavior, package production
line or generated declaration changes; the package total remains 127,096 lines.

Documentation impact: public website documentation.

Validation: Prettier, 66 content checks across 17 files (11.33 s), root-installed
TypeScript and ESLint against the website, and its production preview build pass.
The workspace TypeScript shortcut could not resolve its root-owned binary, so the
same compiler was invoked from the repository root. The initial Roles content
assertion caught a missing boundary phrase; it was restored without weakening
tests. All 31 focused browser checks pass (32.93 s), followed by 12 separate
Roles/Soft Delete/Password Auth theme and viewport combinations with no axe,
overflow or client-error findings. All nine backlog checks pass after handoff.
Complete-diff re-audit is green: corrections stay within the code-example and
accessibility criteria, with no new framework boundary or paused feature.

### Reviewed public pages

Paths below are relative to `apps/website/content/docs/1.0.0`:

- `core/data-modeling/relationships.mdx`
- `core/runtime/api-errors.mdx`
- `core/security-foundations/master-authority.mdx`
- `core/security-foundations/request-identity.mdx`
- `core/security-foundations/security-model.mdx`
- `core/writing-data/delete.mdx`
- `core/writing-data/transactions.mdx`
- `guides/generate-types.mdx`
- `guides/test-an-application.mdx`
- `manual-installation.mdx`
- `operations/before-exposing-your-application.mdx`
- `operations/troubleshooting.mdx`
- `plugins/build-a-plugin/operations-and-graphql.mdx`
- `plugins/official/access.mdx`
- `plugins/official/acl-permissions.mdx`
- `plugins/official/hooks.mdx`
- `plugins/official/http.mdx`
- `plugins/official/password-authentication.mdx`
- `plugins/official/postgresql-vector.mdx`
- `plugins/official/postgresql.mdx`
- `plugins/official/roles.mdx`
- `plugins/official/soft-delete.mdx`
- `plugins/official/validation.mdx`
- `plugins/overview.mdx`
- `plugins/using-plugins.mdx`
- `reference/package-index.mdx`
