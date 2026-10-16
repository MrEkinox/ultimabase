# ADR-0339: `define` describes the schema, `.with` configures each plugin

- Status: accepted
- Date: 2026-10-16
- Supersedes: ADR-0316 shape methods (the `.softDelete()`/`.acl()` chain step and their options);
  ADR-0297's object form of `.with`; ADR-0328's `.with({ relations })` placement; ADR-0332's
  index placement (`.with({ indexes })`) and its rule that `define` indexes cover declared fields
  only
- Refines: ADR-0297 (form D; the last non-generic call still carries every callback), ADR-0321,
  ADR-0332 and its amendment, ADR-0335; applies ADR-0288
- Approval: chosen by the user on 2026-10-16 after the DX review (`docs/handoff/revue-dx-declaration.md`)
  and two spikes (`spike/plugin-methods`, refuted; `spike/define-features-with-builder`, confirmed)

## Context

A developer configures a plugin in four places today: in `define` (`indexes`), on a field, with a
chained shape method (`.softDelete({ mode })`, `.acl()`), or in `.with({ … })`. The placement follows
type constraints the developer cannot see:

- Two indexes declarations exist with different powers.
- `.softDelete()` takes its options while `.acl()` takes none and needs `.with({ acl })`.
- Roles puts plugin options in its `define`.

The first spike showed why one chained method per plugin cannot work. TypeScript checks the
arguments of every inner call of a chain while it types the constant, and only skips the
outermost call. Callbacks that read the schema therefore cycle unless they sit in the last call.
That spike also exceeded the editor thresholds.

The second spike confirmed a two-block form, on TypeScript 6 and 7, from sources and built packages:

- No cycle, including with cyclic schemas, `Register`, mutual relation filters and plugin
  contributions.
- The examples run with it.
- It is faster than today on the form D bench: TS7 0.56/1.76 s and TS6 1.89/5.54 s at 50/200
  schemas, against 0.56/1.92 and 1.99/5.75 s on `main`.

## Decision

1. **`define` describes what the schema is**, with static values only and no callbacks:
   - `className`;
   - `fields`;
   - `indexes`;
   - the feature keys contributed by installed plugins, which replace shape methods. Examples:
     `softDelete: { mode: 'command' }`, `acl: true`. A feature key takes `true` or a static
     options object, and may add fields, statics and commands.
2. **One `indexes`, in `define`**, typed against the complete fields, declared and
   feature-contributed (for example `isDeleted`):
   - A complete non-partial unique index is a typed unique target, at runtime as in types.
   - A partial index enforces uniqueness only.
   - `.with({ indexes })` disappears.
3. **`.with((plugins) => plugins…)` configures how each plugin behaves.**
   - It is the only form, and the last call. It stays non-generic, so the schema's type never
     depends on it.
   - `plugins` offers one method per rules key of the installed plugins, plus Core's `relations`.
     Core generates them generically and never names a plugin.
   - Each method is typed exactly like today's entry of the same name and can be called once.
   - A rule required by a feature (ACL's `default` once `acl: true`) is checked on what the
     callback returns.
   - The object form `.with({ … })` and the shape methods `.softDelete()`/`.acl()` are removed.
4. **Field options stay on the field.** These are the options about one field: field
   `validation`, `access`, `hooks` and `postgres`.
5. **Plugin-owned factories follow the same rule.**
   - `App.UserSchema.define` and `App.RoleSchema.define` accept `indexes` (custom fields included)
     and feature keys.
   - Role behaviour (`ensure`, `deletion`, `resolveCurrent`) moves to
     `.with((plugins) => plugins.roles({ … }))`.
6. **Plugin authoring states the same distinction.** Plugin-kit and the Core plugin entry expose
   two contributions:
   - **features**: `define` keys, static, which may change the schema's shape;
   - **rules**: `.with` methods, typed against the completed schema, callbacks allowed.

   A plugin cannot contribute a reserved key (`className`, `fields`, `indexes`, `relations`,
   `with`).

## Acceptance criteria

These hold before merge:

- **Bench.** The form D bench (medians of three interleaved runs, 1-minute load below 4) stays
  at or below `main` and within the ADR-0297 thresholds.
- **Diagnostics.** Each of the following gives one diagnostic on its own line:
  - an unknown or misspelled `define` key;
  - a misspelled feature option;
  - an index field or index `where` typo, with a readable message (not `never`);
  - a command used without its feature;
  - a builder method called twice.
- **ACL default.** A missing ACL `default` is reported at compile time, by the `.with` callback, or
  at `new App({ schemas })` when `.with` is absent.
- **Usage sites.** `Post.` completions show no configuration member.
- **DX audit.** The DX audit explains every hover and diagnostic difference.

## Consequences

- **Migration.** About 420 `.with` calls, 100 shape-method calls and 31 `.with({ indexes })` move
  to the new form through an AST codemod, plus a manual pass over about 30 non-literal call
  sites and the documentation.
- **Plugin API.** The plugin-kit API renames `shape` to `features`. Official plugins move their
  shape methods to feature keys.
- **Documentation.**
  - The website gets one "Where does it go?" table on the Schemas page.
  - The plugin-authoring guide gets a page on features against rules.
  - Every page and README follows the verified-code rule.
- **Documentation impact:** both.
