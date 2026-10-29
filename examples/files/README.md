# Files

Posts with files (`file()`, `filesPlugin()`): a public cover image, whose
width and height are computed at upload, and a list of private text
attachments, each with a preview variant. A client uploads a file with
`POST /files`, then writes its id in a post.

- `src/models.ts`: the `Post` model and its file fields.
- `src/app.ts`: the application, on `memoryFiles()`, or `s3()` when
  `NODE_ENV` is `production`.
- `src/app.test.ts`: uploads over HTTP, writes over GraphQL, the refused
  uploads, and `files.upload` and `files.check` from server code.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/files` runs its tests.
