# ADR-0286: Accept Milestone 63 with explicit measured costs

- Status: accepted
- Date: 2026-10-02
- Refines: ADR-0279's Milestone 63 completion budgets only
- Approval: user explicitly accepted the final audit costs and deferred debt reduction
- Decision issue: 6316 (archived at tag `reference-archive`: `issues/6300-source-typed-application-authoring/6316-final-parity-and-complexity-audit.md`)

## Context

The final audit (archived at tag `reference-archive`: `issues/6300-source-typed-application-authoring/evidence/6316-final-audit.md`)
proves the configured developer journey and inventories retained capabilities,
but disproves the promised net implementation reduction. The architecture stop
was raised before completion. After reviewing these findings, the user said:
“On accepte et on réduira la dette plus tard”.

## Decision

Accept the delivered configured architecture for this milestone, with these
one-time exceptions recorded as **accepted costs, not passed budgets**:

- Handwritten production: 122,645 → 126,432 lines, +5,556/−1,769, net +3,787.
- Public exports: 1,720 → 1,739; package declaration bytes: 839,935 → 939,352.
- The historical actual-production 50-schema checkpoint exceeds the original
  cold/edit/heap budgets: +46.40%/+81.23%/+28.66%. Its disclosed User-option
  difference means it is not a perfectly feature-identical A/B experiment.
- Full historical distributions cannot be reconstructed for old 1/10-schema
  production probes or individual Runtime samples. Preserve the available raw
  TypeScript samples, paired Runtime medians and these measurement limitations.
- Preserve the earlier failed synthetic timing control as a failed historical
  observation. Passing current checks does not turn it into a historical pass.

Nine fresh current production samples and the exact original/final metrics stay
in the audit. Synthetic hybrid prototype gains must never be described as
delivered-production speed-ups. Readable item hovers retain priority over the
discarded model-flattening optimization. The accepted nested option JSDoc and
method-hover presentation limits remain individually listed in the final report.

This decision supersedes only the final cost/distribution requirements in
Milestone 63's exit contract. Do not rewrite ADR-0279 or the original measurements
to claim that their original ceilings were met. No test threshold, coverage
exclusion, timing assertion or benchmark implementation is changed.

## Unchanged requirements

The full validation gate must pass before completion and commit. Failing current
tests, lost capabilities, weakened security, wrong types or unexplained coverage
loss are **not** accepted exceptions. The historical coverage discrepancy is
resolved separately by a deterministic refresh rejection regression, with two
complete green coverage runs and no covered-location loss against the saved raw
control; it is not waived by this decision.

ADR-0280, ADR-0281 and ADR-0283's retained graph boundaries remain authoritative.
Exact Password User results, complete WHERE, named relationships and full-schema
callbacks still use Typegen. There is no second registry, generated executable
client, new public API, automatic schema registration or concrete plugin knowledge
in Core. The report does not claim Typegen-free or relationships-only generation.

## Consequences

Issue 6316 and Milestone 63 may close after their final validation, diff review
and local commit. This is not permission to push or a claim about hosted CI.
Debt reduction is deferred, not implemented or activated as a new task. Future
changes require a bounded selected issue, evidence and the normal validation
contract; this one-time acceptance is not a waiver for future regressions.
