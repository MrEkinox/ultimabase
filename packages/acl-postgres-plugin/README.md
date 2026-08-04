# @ultimabase/acl-postgres-plugin

Connects the database-neutral ACL provider to PostgreSQL's versioned constraint
compiler registry. The integration compiles public, authenticated, exact
principal, and resolved-role grants into parameterized JSONB containment
predicates combined with logical `OR`. PostgreSQL then combines that result with
the developer query and every other Access constraint through logical `AND`.

```ts
import { aclPostgresPlugin } from '@ultimabase/acl-postgres-plugin'
import { aclPlugin } from '@ultimabase/acl-permissions-plugin'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const ultimabase = new UltimaBase({
	schemas: [Post],
	plugins: [
		aclPlugin(),
		postgresPlugin({ url: process.env.DATABASE_URL }),
		aclPostgresPlugin(),
	],
})
```

Both dependency plugins are required. The integration owns no connection,
schema, authority, hooks, or lifecycle state; it only validates the opaque ACL
payload and registers its PostgreSQL compiler. Master requests emit no ACL row
constraint, so this plugin adds no predicate on the audited bypass path.

The same integration compiles ACL subject-reference searches used during
provider-owned deletion. Exact principal and role lookups become parameterized
JSONB containment predicates and therefore reuse each ACL field's generated
GIN index. ACL cleanup still runs as ordinary singular updates inside the
subject deletion transaction; this package never chooses `fail`, `preserve`,
or `cascade` policy.
