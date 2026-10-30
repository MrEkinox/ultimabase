# Roles and ACL

Roles a user holds (`defineRole`, `rolesPlugin()`), and per-row rights
(`acl()`, `aclPlugin()`): only a `writer` creates a note, a new note is its
author's alone, and the `shareNote` function lets a role read it. Only Master
writes an ACL, so the function checks the caller before it changes one.

- `src/models.ts`: the `Role` and `User` models.
- `src/notes.ts`: the `Note` model, whose rows hold an ACL.
- `src/functions.ts`: the `shareNote` and `myRoles` functions.
- `src/app.ts`: the application.
- `src/app.test.ts`: each right, used over GraphQL, and the `ACL` class.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/roles-and-acl` runs its tests.
