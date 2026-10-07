import {
	defineOperationTransport,
	definePluginFieldWireProtocol,
	type OperationTransportProtocol,
	type PluginFieldWireProtocol,
} from '@ultimabase/core'

/** Identifies generated GraphQL application requests in shared diagnostics. */
export const graphqlProtocol: OperationTransportProtocol<
	'ultimabase.graphql',
	'1.0.0'
> = defineOperationTransport({
	name: 'ultimabase.graphql',
	version: '1.0.0',
})

/** Identifies explicit plugin-operation bindings compiled into GraphQL roots. */
export const graphqlOperationProtocol: OperationTransportProtocol<
	'ultimabase.graphql.operation',
	'1.0.0'
> = defineOperationTransport({
	name: 'ultimabase.graphql.operation',
	version: '1.0.0',
})

/** Identifies the canonical owner-supplied GraphQL v1 plugin-field codec. */
export const graphqlFieldProtocol: PluginFieldWireProtocol<
	'ultimabase.graphql.field',
	'1.0.0'
> = definePluginFieldWireProtocol({
	name: 'ultimabase.graphql.field',
	version: '1.0.0',
})
