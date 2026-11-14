---
'@ultimabase/roles': patch
'ultimabase': patch
---

Only Master links a role through a `many` field the developer adds to the role model, from either
side. A client allowed to write the other model, such as `Perm.update` with
`roles: { connect: [{ id: admin.id }] }`, linked a role and is now refused with `ACCESS_DENIED`. A
write rule the developer gives such a field no longer opens it; its read rule still applies.
