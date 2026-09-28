# 6301: Prove source inference and lock DX budgets

- Status: ready
- Milestone: 63
- Packages: repository tooling, `@ultimabase/core`, representative plugins
- Depends on: none
- ADR: none; evidence for ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Prove the complete approved authoring shape on the supported TypeScript version
before production migration and lock reproducible editor, compiler, memory, and
complexity budgets against the current Typegen form.

## Acceptance criteria

- [ ] Disposable fixtures implement the exact target syntax from the milestone DX contract without changing production exports.
- [ ] Minimal, representative, and stress profiles contain 1, 10, and 50 schemas with Core fields, objects, pointers, relations, nested writes, Access, Hooks, validation, the logical vector field contract, Soft Delete, Password User, Roles, and plugin operations.
- [ ] The proof infers exact fields, inputs, results, Access items and filters, Hook inputs, plugin fields, schema mutations, specialized schemas, and direct class methods without generated declarations.
- [ ] Source and packed-package language services verify positive completions, concise documented hovers, signatures, and focused negative diagnostics.
- [ ] Repeated isolated measurements record Typegen regeneration, complete edit-to-diagnostic latency, cold typecheck, language-service initialization, warm completion/hover/diagnostic latency, declaration size, and peak heap for old and proposed forms.
- [ ] Exact budgets are written before production migration and are no weaker than the default ceilings in the DX contract unless the user explicitly approves an evidence-backed exception.
- [ ] The proof identifies TypeScript recursion, instantiation, union-size, circular-relation, and plugin-projection limits.
- [ ] `UltimaBase.Schema.define()` proves the zero-plugin portable case, configured descendants prove application-local typing, and compatible reuse plus package-specialized schemas require no second compiler.
- [ ] `field.vector()` completes and infers its exact current value/options only on a factory configured with `pgVectorPlugin()`; the zero-plugin and unrelated factories reject it with a focused diagnostic, without claiming PostgreSQL persistence.
- [ ] The prototype is removed or kept only as test tooling explicitly required by later issues; no production facade ships from this issue.
- [ ] Documentation impact is recorded.

## Stop conditions

- The exact `App.Schema.define({...})` syntax cannot type Access and Hooks from sibling `fields` declarations.
- A plugin needs ambient global augmentation, manual generated declarations, or a duplicate type registry.
- The 50-schema profile exceeds the locked latency, memory, or hover-readability ceiling.
- Any current capability needs `Schema.use()`, automatic registration, or a second plugin installation path.

## Tests

- [ ] TypeScript compiler and real language-service proof suite.
- [ ] Source and packed-package module-resolution variants.
- [ ] Deterministic benchmark harness with raw samples and summarized distributions.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision, old-form measurements, fixture scope, and every unavailable prerequisite before implementation.
- [ ] Audit the complete issue diff against the saved DX, all represented capabilities, source/packed parity, Typegen-generation and edit-to-diagnostic benchmark fairness, hover readability, and absence of production or generated fallback code.
- [ ] Record every audit iteration and raw measurement location in the handoff; correct findings and repeat the complete audit until none remain.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; no budget, assertion, fixture, coverage input, or sample may be weakened to pass.
- [ ] Complete every acceptance/test checkbox, record exactly one Documentation impact classification, and pass `yarn validate:full` before setting `completed`.
- [ ] Create one dedicated local commit only after the green audit, inspect its complete diff and exact line categories, and amend/re-audit if that inspection finds anything. Do not push.

## Out of scope

- Changing a production public API.
- Keeping Typegen as a fallback.
- Accepting the architecture ADR before the proof passes.
