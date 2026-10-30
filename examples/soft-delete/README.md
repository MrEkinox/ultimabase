# Soft delete

Posts that a delete keeps (`softDelete()`, `softDeletePlugin()`): a deleted
post gets a `deletedAt` date and leaves every ordinary read. The `trash`
and `restorePost` functions give clients the plugin's `Post.trash` and
`Post.restore`.

- `src/models.ts`: the `Post` model.
- `src/functions.ts`: the `trash` and `restorePost` functions.
- `src/app.ts`: the application.
- `src/app.test.ts`: a post deleted, read in the trash and restored over
  GraphQL and from server code.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/soft-delete` runs its tests.
