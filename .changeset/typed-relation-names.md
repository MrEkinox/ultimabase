---
'ultimabase': minor
---

The types check the field names of `from` and `within` (D-238). A view's
`from` names a `many` of its model that stores its rows, or fails on the
field; the target's side of a `within` names a field of the target, or
fails on `defineApp`, as an unknown `inverse` does. The startup checks are
unchanged.
