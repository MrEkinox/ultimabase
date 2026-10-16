# ADR-0340: Lower what every application pays

- Status: accepted
- Date: 2026-10-17
- Refines: ADR-0206/ADR-0311 (Master authority), ADR-0279 (configured factory), ADR-0297 (`Register`),
  the field-options records, the server-provider records; applies ADR-0288
- Approval: DX review of 2026-10-16 (`docs/handoff/revue-dx.md` §1 and §5.1,
  `docs/handoff/revue-dx-declaration.md` Partie 2), fix pass decided by the user on 2026-10-17

## Context

Every application pays the same costs before writing its first useful line.

- **Master keys.** `MasterAuthority` requires a non-empty `keys` list, yet `useMasterKey: true` never checks a
  key. In-process elevation uses only `keys[0].id`; the raw value matters only for the HTTP header. Seven examples
  and the create-app template copy about 15 lines that read, guard and audit an environment variable. Because the
  application module reads the key at import, six Vitest configurations inject a fake key.
- **Signal handling.** Fourteen `main.ts` files copy the same eight-line wait on `SIGINT`/`SIGTERM`, in two styles.
  A top-level `await using` disposes the application as soon as the module ends.
- **Defaults.** A field with a `default` stays nullable. The starter's `done: f.boolean({ default: false })` is
  typed `boolean | null`, and `!task.done` silently treats `null` as `false`. Virtual fields say `nullable: false`
  where stored fields say `required: true`.
- **Presets.** `UltimaBase.use(...)` does not accept a preset list, so every app writes `...apiServer({ … })`.
- **Request principal.** The request principal stays `PointerValue` unless the app adds a second, undocumented
  `Register` key, even when `App.UserSchema` already designates the user schema.
- **No database.** With no database provider installed, `start()` succeeds silently. Every operation then reports
  "UltimaBase must be started before request execution" on a started application.

## Decision

1. **Master needs no key for in-process use.**
   - `new MasterAuthority({ onUse })` is valid; `keys` is optional.
   - A transport that accepts raw keys, such as `httpPlugin({ master: true })`, refuses to start without at least
     one key, with a message naming the option.
   - Keys may be given lazily, as a function read once at `start()`, so the application module no longer reads
     the environment at import. Core still never reads the environment itself.
   - `onUse` stays mandatory: every Master use is audited.
2. **The started application exposes when it closes.**
   - The handle returned by `start()` exposes a `closed` promise, generic in Core with no knowledge of processes
     or signals, which resolves when the application stops or is disposed.
   - The managed server plugin (`honoServerPlugin`) stops the application on `SIGINT`/`SIGTERM` by default, and an
     option turns that off.
   - `main.ts` becomes `await using app = await ultimabase.start(); await app.closed`.
3. **A default makes a stored field non-null.**
   - A field with a `default` (or `autoNow`, `autoIncrement`) is typed and stored as non-null, unless it declares
     `nullable: true`.
   - Explicit `null` on such a field is rejected, as for `required: true`.
   - Virtual fields use the same vocabulary: `nullable: true` instead of `nullable: false` being the opt-out.
4. **`use()` accepts presets.** `UltimaBase.use(...)` accepts plugin definitions and arrays of them, flattened in
   order, so `apiServer({ … })` needs no spread.
5. **The principal follows the user schema.**
   - When the registered application installs a plugin that designates a user schema (through a generic Core
     marker the auth plugin sets; Core never names the auth plugin), the request principal's type is a pointer to
     that schema with no extra `Register` key.
   - The manual `principal` key remains for apps that identify callers differently.
6. **No silent start without a database.** `start()` fails with a clear message naming the missing capability when
   schemas are registered but no database provider is installed.

## Consequences

- **Examples and templates.**
  - Examples and `create-app` lose the Master boilerplate, the fake keys in test configurations, the signal loop
    and the `...` spreads.
  - Schemas that relied on a nullable default must add `nullable: true`. The change is converted in the same work,
    with no migration support, since UltimaBase is unreleased.
- **Tests.**
  - Master without keys, in process and through a transport.
  - Lazy keys read at start.
  - `closed` resolving on stop and on dispose.
  - The server plugin's signal handling, with and without its opt-out.
  - Default fields typed and validated as non-null, and `nullable: true`.
  - Nested preset arrays.
  - Principal derivation, typed with and without the auth plugin.
  - The missing-database start error.
- **Measurements and docs.**
  - Form D bench, because default nullability touches field types.
  - DX audit.
  - Documentation updated on every affected page and README.
- **Documentation impact:** both.
