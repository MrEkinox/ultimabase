# @ultimabase/access-plugin

Official authorization for UltimaBase: fail-closed schema rules in
`.with({ access: … })`, field rules, request-aware predicates,
`allowWithoutRule` openings and `can()`.

## Installation

```sh
npm install @ultimabase/access-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. The application also needs a database
plugin.

## Example

Install it in the configured factory, from the tested
[`examples/access`](../../examples/access/README.md) application:

<!-- region ../../examples/access/src/app.ts#factory -->

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

/**
 * Access denies every operation that has no schema rule. Roles supplies the
 * `hasRole()` facts and Soft Delete the commands and permission ruled on
 * `Comment`; Access imports neither. `postgresPlugin()` reads
 * `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	rolesPlugin(),
	softDeletePlugin(),
	apiServer({ rest: true }),
	postgresPlugin(),
)
```

<!-- endregion -->

## Documentation

- [Access](../../apps/website/content/docs/1.0.0/plugins/official/access.mdx)
- [Security Model](../../apps/website/content/docs/1.0.0/core/security-foundations/security-model.mdx)
- [Request Identity](../../apps/website/content/docs/1.0.0/core/security-foundations/request-identity.mdx)
- [Before Exposing Your Application](../../apps/website/content/docs/1.0.0/operations/before-exposing-your-application.mdx)
