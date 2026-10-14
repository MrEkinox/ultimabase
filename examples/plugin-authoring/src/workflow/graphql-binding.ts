//#region graphql-binding
import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
} from '@ultimabase/core'

import { formatWorkflow } from './operations.ts'

/** The canonical GraphQL protocol, named without importing the GraphQL package. */
const graphqlOperations = defineOperationTransport({
	name: 'ultimabase.graphql.operation',
	version: '1.0.0',
})

export const formatGraphqlBinding = operationTransportBinding({
	codec: operationWireCodec({
		decode: (value: unknown) =>
			formatWorkflow.input.snapshot(value, 'formatWorkflow input'),
		encode: (value) => value,
		operation: formatWorkflow,
		transport: graphqlOperations,
	}),
	metadata: {
		field: 'formatWorkflow',
		input: {
			kind: 'non-null',
			ofType: { kind: 'named', name: 'String' },
		},
		kind: 'graphql-operation-binding',
		result: {
			kind: 'non-null',
			ofType: { kind: 'named', name: 'String' },
		},
		root: 'query',
		types: [],
	},
	operation: formatWorkflow,
})
//#endregion graphql-binding
