# 2006: Verify the Standard Schema validation vertical

- Status: planned
- Milestone: 20
- Packages: repository-wide
- Depends on: 2007
- ADR: all accepted milestone 20 decisions

## Goal

Prove that direct field presence, inspectable storage shape, and
validator-neutral application constraints form one complete public and Runtime
validation model.

## Acceptance criteria

- [ ] A production-source audit finds no nested `validation.required`, built-in length, range, pattern, finite, UUID-version, decimal precision, or decimal scale validation DSL.
- [ ] Core remains the authority for canonical types, missing and null handling, defaults, generators, structured values, relationships, field shape, and validation pipeline placement.
- [ ] Standard Schema remains opaque, synchronous, validation-only, vendor-neutral, non-bypassable by master, and unable to silently transform values or influence adapter storage.
- [ ] PostgreSQL compiles decimal storage exclusively from direct shape metadata and passes Runtime, synchronization, migration, and Testcontainers coverage.
- [ ] Built-in and plugin-defined fields pass source, generated, JavaScript, Typegen-free, packed-package, public E2E, and application-isolation verification with multiple validators.
- [ ] Public declarations, archives, manifests, dependency constraints, exports, deep-import guards, active architecture, package READMEs, examples, and contributor guidance expose only the canonical contract.
- [ ] Active planning and documentation contain no validation-only derived
      field package or logical field kinds superseded by native fields composed
      with Standard Schema.
- [ ] No concrete validator is a production dependency of Core, Typegen, Shared, Plugin Kit, or an official Runtime plugin unless that package independently owns it.
- [ ] File-size baselines decrease or disappear wherever deleting the old constraint implementation permits.
- [ ] The milestone README records exact commands, focused interoperability and PostgreSQL evidence, and any deliberately deferred work.

## Tests

- [ ] `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.
- [ ] `yarn test:pack` passes against built package archives.
- [ ] `yarn test:e2e:built` passes, including PostgreSQL Testcontainers coverage.

## Out of scope

- Async business validation or database uniqueness.
- Input coercion, transformation, or a replacement Hooks lifecycle.
- Selecting a validation library for application developers.
