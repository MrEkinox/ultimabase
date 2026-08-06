import { Query, type CreateOneOperationAst } from '../../query/index.js'
import { Schema, stringField } from '../../schema/index.js'
import type { MaybePromise } from '@ultimabase/shared'
import { expectTypeOf } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import {
	createRuntimeValidationStage,
	type RuntimeValidationOptions,
	type UuidV7Generator,
} from '../index.js'
import type { RuntimeOperationTransformStage } from '../pipeline/contracts.js'

const schema = Schema.define({
	className: 'TypedRuntimeValidation',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})
const operation: CreateOneOperationAst<typeof schema> = {
	kind: 'create-one',
	selection: { fields: [], kind: 'selection' },
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
	uuidV7Generator: (() =>
		'0198a43e-2431-7000-8000-000000000001') satisfies UuidV7Generator,
} satisfies RuntimeValidationOptions
const stage = createRuntimeValidationStage(options)

// Structural normalization preserves the exact operation contract for later stages.
expectTypeOf(stage).toEqualTypeOf<RuntimeOperationTransformStage>()
expectTypeOf(stage({ context, operation })).toEqualTypeOf<
	MaybePromise<CreateOneOperationAst<typeof schema>>
>()
