//#region rest-binding
import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
} from '@ultimabase/core'

import { formatWorkflow } from './operations.ts'

/** The canonical REST protocol, named without importing the REST package. */
const restOperations = defineOperationTransport({
	name: 'ultimabase.rest',
	version: '1.0.0',
})

/** Keeps REST's `POST /api/operations/formatWorkflow` once GraphQL is bound. */
export const formatRestBinding = operationTransportBinding({
	codec: operationWireCodec({
		decode: (value: unknown) =>
			formatWorkflow.input.snapshot(value, 'formatWorkflow input'),
		encode: (value) => value,
		operation: formatWorkflow,
		transport: restOperations,
	}),
	metadata: { errors: {} },
	operation: formatWorkflow,
})
//#endregion rest-binding
