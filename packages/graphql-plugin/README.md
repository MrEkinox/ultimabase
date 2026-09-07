# `@ultimabase/graphql-plugin`

Network-independent GraphQL schema generation for UltimaBase applications.

```ts
import { Schema, createApplication } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
	graphql: true,
})

const application = await createApplication({
	schemas: [Post],
	plugins: [graphqlPlugin()],
})

const graphql = application.getPlugin('@ultimabase/graphql-plugin')
graphql.schema
```

The plugin compiles one application-local `GraphQLSchema` after the complete
Core schema graph exists. Importing the package installs no behavior. It does
not import HTTP, Yoga, REST, authentication, policy, or database providers.

## Schema exposure

Application-owned schemas inherit the safe built-in operation defaults.
`graphql: false`, `graphql: true`, or an immutable option object overrides the
surface for one schema. A global sparse default can be supplied through
`graphqlPlugin({ default })`. Exposure only controls which GraphQL declarations
exist; it never grants access or bypasses Runtime policy.

GraphQL compilation rejects plugin-owned schemas carrying a direct `graphql`
option, invalid or colliding names, plugin fields without the canonical
`ultimabase.graphql.field@1.0.0` JSON codec, and final schemas without a query
root field. No synthetic health or placeholder query is added.

Issue 609 supplies structural model, create, update, enum, scalar, embedded
object, pointer, relation-connection, and `get<Type>` declarations. Later
milestone issues add read filters and normalization, cursor behavior, Runtime
execution, explicit plugin operations, custom schema composition, and Yoga.
