# Standard package simplification

Completed on 2026-10-02. The user approved sequential keep-or-reject experiments;
the [milestone](../../../issues/6500-standard-package-simplification/README.md)
and its three issues contain the durable proofs and audit.

- Valibot: reject; exact validation order/diagnostics and untrusted-object checks
  leave a larger guarded replacement. No production or dependency change.
- GraphQL Tools: keep standard graph rewiring, strict UltimaBase ownership and
  conflict policy unchanged. Production -99 lines; +311 parity-test lines.
- Atomic writing: reject; target resolution/permissions diverge and restoring
  sibling-rename semantics retains the machinery being replaced.

Full validation and coverage pass for the retained production change; final
Markdown-only completion uses targeted checks, not another unchanged full run.
No public API or Typegen change. Commits are local; pushing requires approval.
