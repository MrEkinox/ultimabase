# Introduction

The model of the documentation's introduction: posts that clients read only
once published, and that only server code writes.

- `src/models.ts`: the `Post` model.
- `src/app.ts`: the application.
- `src/app.test.ts`: the posts read and refused over GraphQL, read over
  REST and from server code.

`yarn start` serves it on http://localhost:3000/graphql and
http://localhost:3000/api/posts; `yarn vitest
examples/introduction` runs its tests.
