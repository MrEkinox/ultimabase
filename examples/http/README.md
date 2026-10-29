# HTTP

Routes of the application's own beside the API (`httpPlugin()`,
`routes()`): a receipt read as the caller, a payment webhook whose body is
validated, and the answers the HTTP plugin gives by itself.

- `src/models.ts`: the `Order` model.
- `src/routes.ts`: the routes.
- `src/app.ts`: the application.
- `src/app.test.ts`: the routes called as a client does, CORS, the body
  limit and the errors.

`yarn start` serves it on http://localhost:3000; `yarn vitest examples/http`
runs its tests.
