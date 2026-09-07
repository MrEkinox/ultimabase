import {
	definePluginFieldWireProtocol,
	type PluginFieldWireProtocol,
} from '@ultimabase/core'

/** Identifies the canonical owner-supplied GraphQL v1 plugin-field codec. */
export const graphqlFieldProtocol: PluginFieldWireProtocol<
	'ultimabase.graphql.field',
	'1.0.0'
> = definePluginFieldWireProtocol({
	name: 'ultimabase.graphql.field',
	version: '1.0.0',
})
