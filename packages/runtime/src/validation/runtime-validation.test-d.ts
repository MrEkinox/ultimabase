import { Query, type CreateOneOperationAst } from '@ultimabase/query'
import { defineSchema, stringField } from '@ultimabase/schema'
import type { MaybePromise } from '@ultimabase/shared'
import { expectTypeOf } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import type { RuntimeOperationTransformStage } from '../pipeline/contracts.js'
import {
	createRuntimeValidationStage,
	type RuntimeValidationOptions,
} from './runtime-validation.js'

const schema = defineSchema({
	className: 'TypedRuntimeValidation',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})
const operation: CreateOneOperationAst<typeof schema> = {
	kind: 'create-one',
	schema: new Query(schema).ast.schema,
	input: { title: 'typed' },
}
const context = RequestContext.anonymous({
	requestId: 'typed-runtime-validation',
	source: requestSources.internal,
})
const options = {
	clock: () => new Date(),
	timezone: 'UTC',
} satisfies RuntimeValidationOptions
const stage = createRuntimeValidationStage(options)

// Structural normalization preserves the exact operation contract for later stages.
expectTypeOf(stage).toEqualTypeOf<RuntimeOperationTransformStage>()
expectTypeOf(stage({ context, operation })).toEqualTypeOf<
	MaybePromise<CreateOneOperationAst<typeof schema>>
>()
