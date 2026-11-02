# Access rules

A newsroom's articles, shown on the documentation's Access rules page: a read
rule that filters the rows, write rules per operation, rules on single fields
and rules combined with `allOf`. A team's projects show rights that follow
from a relation, and the hooks that keep a group's writes to its owner.

- `src/models.ts`: the `Article` model and its rules.
- `src/projects.ts`: the `Person`, `Project` and `Task` models, read through
  their members.
- `src/app.ts`: the application.
- `src/app.test.ts`: the rules at work for two signed-in users, for Master,
  and for an anonymous caller over GraphQL.
- `src/projects.test.ts`: a project's members, its owner and an outsider.

`yarn start` serves it on http://localhost:3000/graphql; `yarn vitest
examples/access-rules` runs its tests.
