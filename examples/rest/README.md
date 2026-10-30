# REST

The REST API `restPlugin()` generates from the models and the functions:
each model's routes, Relay pages, filters, `select` and `include`, the
writes and the upsert, the names a model or a function sets, the limits a
client meets, and the OpenAPI document. GraphQL serves the same models, to
show both answer alike.

- `src/models.ts`: the `Person`, `Post` and `Revision` models.
- `src/functions.ts`: three functions, one renamed and one hidden.
- `src/app.ts`: the application.
- `src/app.test.ts`: the API used as a client would.
- `src/list.ts` and `src/list.test.ts`: the same models with
  `pagination: 'list'`.

`yarn start` serves it on http://localhost:3000/api, its OpenAPI document
on http://localhost:3000/api/openapi.json; `yarn vitest examples/rest` runs
its tests.
