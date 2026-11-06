# Maintenance

A GraphQL API whose maintenance Master turns on and off
(`maintenancePlugin()`): while it is on, every request but Master's answers
503 `MAINTENANCE`, and the WebSockets open close.

- `src/app.ts`: the application, and `src/models.ts` its model.
- `src/requests/`: the requests and responses the page shows.
- `src/app.test.ts`: the maintenance turned on and off, as a client reads
  it, and Master served meanwhile.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/maintenance` runs its tests.
