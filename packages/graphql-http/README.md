# `@ultimabase/graphql-http`

Provider-neutral integration contract for one application-local GraphQL HTTP
endpoint. This package is not a plugin and installs no behavior.

A GraphQL HTTP adapter provides `graphqlHttpEndpointCapability`; browser tools
such as GraphiQL or Apollo Sandbox require it without importing that adapter:

```ts
import { graphqlHttpEndpointCapability } from '@ultimabase/graphql-http'
import { requireCapability } from '@ultimabase/core/plugin'

const endpoint = requireCapability(graphqlHttpEndpointCapability, '^1.0.0')
```

The single application-lifetime value contains only the adapter's normalized
absolute `path`. Multiple providers conflict deterministically, so a consumer
never chooses or switches between GraphQL endpoints.

When no adapter is installed, the endpoint capability's hint (ADR-0313) tells the
developer to install a GraphQL HTTP transport.

`graphqlIntrospectionCapability` (ADR-0312) announces that the endpoint
answers introspection. The adapter provides it only while introspection is
enabled, and explorers require it while their route is served, so an
explorer served with introspection off refuses to start with
`PLUGIN_CAPABILITY_MISSING` and a hint naming the option to change:

```ts
import { graphqlIntrospectionCapability } from '@ultimabase/graphql-http'

const introspection = requireCapability(
	graphqlIntrospectionCapability,
	'^1.0.0',
)
```
