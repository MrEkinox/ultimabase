---
'ultimabase': patch
---

A json value nested more than 1000 levels deep is refused, instead of running out of stack with a 500 (D-330): `VALIDATION_FAILED` in a write, `INVALID_QUERY` in a filter. REST answers them with a 400; GraphQL, as for every error, with its code in `errors[].extensions.code` and HTTP 200.
