import { expectTypeOf } from 'vitest'

import {
	graphqlHttpEndpointCapability,
	type GraphqlHttpEndpoint,
	type GraphqlHttpEndpointCapability,
} from './index.js'

expectTypeOf(
	graphqlHttpEndpointCapability,
).toEqualTypeOf<GraphqlHttpEndpointCapability>()
expectTypeOf<GraphqlHttpEndpoint>().toEqualTypeOf<
	Readonly<{ readonly path: string }>
>()
