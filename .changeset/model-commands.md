---
'ultimabase': minor
---

`.commands<T>(build)` adds the application's commands to a model, typed by
its interface: `Match.end(id)` next to `Match.update(…)` (D-217). They run
on the server only. A plugin's command named `paginate`, `paginated` or
`commands` is now refused instead of being overwritten by the model's method.
