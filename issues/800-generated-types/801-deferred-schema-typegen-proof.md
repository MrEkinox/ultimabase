# 801: Prove deferred schema compilation and typegen bootstrap

- Status: ready
- Milestone: 8
- Packages: `@ultimabase/core`, `@ultimabase/pg-vector-plugin`, prototype tooling only
- Depends on: 125, 145, 207, 728
- ADR: proposed ADR produced only after the proof succeeds

## Goal

Prove that `Schema.define()` can retain a Nexus-style field callback until
plugin declarations are available, then generate exact TypeScript contracts
without relying on recursive contextual inference or TypeScript 7-only editor
behavior.

## Target proof

```ts
const Document = Schema.define({
	className: 'Document',
	fields(field) {
		field.string('title')
		field.vector('embedding', { dimensions: 1536 })
	},
})
```

## Acceptance criteria

- [ ] A disposable prototype records field callbacks without resolving plugin methods during module evaluation.
- [ ] A pure plugin declaration phase registers `vector` before the prototype resolves schema fields.
- [ ] The generator loads the application through transpilation even when `field.vector()` is initially absent from TypeScript's generated registry.
- [ ] One generated declaration makes `field.vector()`, model values, Query selection, Access, and hooks complete exactly on the supported stable TypeScript version.
- [ ] Nested objects, enum literals, pointers, relations, and one plugin-defined scalar preserve exact types without `any`.
- [ ] The proof explicitly resolves the behavior of `new Model()`, static schema metadata, schemas reused by two applications, and schemas compiled with a missing or conflicting plugin.
- [ ] Generated declarations remain application-scoped and do not leak one application's plugin methods into another generated project.
- [ ] The prototype records baseline and generated TypeScript memory, typecheck, and completion observations without presenting an unmeasured performance claim as proven.
- [ ] Production code and public exports remain unchanged until the user validates the demonstrated result.

## Tests

- [ ] Focused runtime fixtures cover deterministic declaration ordering and conflict failures.
- [ ] TypeScript language-service fixtures cover completions, hovers, unknown fields, and the first-generation bootstrap on the supported stable compiler.
