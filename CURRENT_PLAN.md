# Current plan: Password Auth option simplification

- Status: completed
- Milestone: 38
- Baseline: `6cdc1374`

The user authorized continuation of debt and DX reduction on 2026-09-25 while
retaining everything UltimaBase currently permits.

Issue 3801 is complete. Password Auth's root, password, and session option
objects now use Plugin Kit's canonical strict immutable parser, and its numeric
policies share one package-private bounded-integer resolver. The change removes
28 production lines while retaining every supported option, security bound,
default, string-key diagnostic, cookie rule, User rule, peer decision, and
inferred public type. Package tests, types, build, repository typecheck, lint,
issue validation, and simplification measurement pass.

Milestone 38 is closed. The next reduction must begin as another bounded issue.

No push is authorized.
