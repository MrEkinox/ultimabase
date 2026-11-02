---
'ultimabase': minor
'@ultimabase/http': minor
'@ultimabase/files': minor
'@ultimabase/maintenance': minor
'@ultimabase/graphql': minor
---

Each plugin declares the codes its errors carry in its types' `errors`, and `ultimabase` exports `ErrorCodeOf<typeof app>`: the kernel's codes and those of each plugin the application lists, for a client to type its messages against (D-206). A GraphQL document the schema refuses, as an unknown field, now carries `extensions.code: 'BAD_USER_INPUT'`, as REST's refused query.
