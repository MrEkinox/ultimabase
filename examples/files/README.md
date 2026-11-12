# Files

Posts with files (`file()`, `filesPlugin()`): a public cover image, whose
width and height are computed at upload, and a list of private text
attachments, each with a preview variant. A client uploads a file with
`POST /files`, then writes its id in a post.

- `src/models.ts`: the `Post` model and its file fields.
- `src/app.ts`: the application.
- `src/storage.ts`: `memoryFiles()`, `diskFiles()` when `FILES_DIR` is set, or
  `s3()` when `NODE_ENV` is `production`.
- `src/requests/`: the GraphQL requests and responses the page shows.
- `src/app.test.ts`: uploads over HTTP, writes over GraphQL, the refused
  uploads, and `files.upload`, `files.check` and `files.refresh` from server
  code.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/files` runs its tests.
