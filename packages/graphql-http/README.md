# `@ultimabase/graphql-http`

Provider-neutral integration contract for one application-local GraphQL HTTP
endpoint. This package is not a plugin and installs no behavior.

A GraphQL HTTP adapter provides `graphqlHttpEndpointCapability`; browser tools
such as GraphiQL or Apollo Sandbox require it without importing that adapter:

```ts
import { graphqlHttpEndpointCapability } from '@ultimabase/graphql-http'
import { requireCapability } from '@ultimabase/core'

const endpoint = requireCapability(graphqlHttpEndpointCapability, '^1.0.0')
```

The single application-lifetime value contains only the adapter's normalized
absolute `path`. Multiple providers conflict deterministically, so a consumer
never chooses or switches between GraphQL endpoints.
