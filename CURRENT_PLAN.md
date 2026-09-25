# Current plan: capability host simplification

- Status: completed
- Milestone: 37
- Baseline: `03397a6c1d8bb0c10d85bbedc4a116492bc9e5f2`

The user authorized continuation of debt and DX reduction on 2026-09-25 while
retaining everything UltimaBase currently permits.

Issue 3701 is complete. Core's capability host now owns one materialized record
per token, capability inventory provides exact indexed plans, and owner/global
cleanup share one reverse drain. The change removes 14 production lines with
no public export, declaration, test, or behavior change. Focused and complete
Core tests, repository typecheck, lint, build, issue validation, and
simplification measurement pass.

Milestone 37 is closed. The next reduction must begin as another bounded issue.

No push is authorized.
