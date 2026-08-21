# Milestone 20 — Standard Schema field validation

- Status: planned

Replace Core's closed field-constraint DSL with one validator-neutral Standard
Schema V1 boundary. Presence remains framework metadata through a direct
`required` option, while decimal precision and scale remain explicit because
database adapters must inspect them. Additional application constraints use a
validator selected by the developer:

```ts
const Task = Schema.define({
	className: 'Task',
	fields: (field) => ({
		progress: field.float({
			required: true,
			validation: z.number().finite().min(0).max(1),
		}),
		price: field.decimal({
			precision: 12,
			scale: 2,
			validation: z.string().refine(isAcceptedPrice),
		}),
	}),
})
```

Core still snapshots the field kind, presence, nullability, defaults, generated
values, and structured shape. A Standard Schema validator receives the complete
canonical non-null field value after that snapshot, including the array for a
list field or the complete object for an object field. It may report issues but
must return a semantically equal value. Missing and null values remain governed
by Core, asynchronous results fail explicitly, and database-backed business
checks remain hooks or protected constraints rather than structural validation.

## Execution order

1. [x] [2001 — Decide the Standard Schema field-validation boundary](2001-standard-schema-field-validation-adr.md)
2. [ ] [2002 — Move required presence to a direct field option](2002-direct-required-field-option.md)
3. [ ] [2003 — Move decimal shape metadata to direct field options](2003-direct-decimal-shape-options.md)
4. [ ] [2004 — Replace field constraints with Standard Schema](2004-standard-schema-field-validators.md)
5. [ ] [2005 — Prove validator interoperability and generated DX](2005-validator-interoperability-typegen-dx.md)
6. [ ] [2006 — Verify the Standard Schema validation vertical](2006-standard-schema-validation-verification.md)

The order first fixes the durable contract, then separates presence and
adapter-visible shape from application validation. The Standard Schema Runtime
replacement can therefore remove the old DSL atomically without hiding storage
metadata inside an opaque validator. Interoperability and final verification
run only after the canonical public API exists.

## Deliberate boundaries

- Core directly depends on the types-only `@standard-schema/spec` protocol and
  never imports Plugin Kit or a concrete validator.
- `required`, `precision`, `scale`, enum domains, relationship targets, list
  shape, timezone behavior, and other structural metadata are not delegated to
  an opaque validator.
- Validation is synchronous, deterministic, validation-only, and may run at
  multiple structural boundaries. It is not an input transformation lifecycle.
- Standard Schema defaults and coercions do not replace Core defaults,
  generators, field snapshots, Hooks `resolveInput`, or adapter constraints.
- The public replacement retains no compatibility overload, deprecated alias,
  dual syntax, or decoder for the removed validation objects.
- No new package is created and JavaScript applications still run without
  Typegen or a generated client.

## Completion gate

The final issue records exact repository-wide typecheck, unit, lint, format,
build, packed-package, JavaScript, Typegen, public E2E, and PostgreSQL evidence.
It also proves that published packages depend on no concrete validator and that
active source and documentation contain no superseded validation DSL.
