import type { FrameworkApplication } from '../../foundation.js'
import { Query, type CreateOneOperationAst } from '../../query/index.js'
import { Schema, stringField } from '../../schema/index.js'
import type { MaybePromise } from '@ultimabase/shared'
import { expectTypeOf, test } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import type {
	DatabaseOperationOutcome,
	DatabaseOperationResult,
} from '../database/contracts.js'
import { createNativeHookStages } from './dispatcher.js'

const schema = Schema.define({
	className: 'TypedNativeHook',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})
const operation = {
	input: { title: 'Typed' },
	kind: 'create-one',
	schema: new Query(schema).ast.schema,
} satisfies CreateOneOperationAst<typeof schema>
const context = RequestContext.anonymous({
	requestId: 'typed-native-hook',
	source: requestSources.internal,
})

declare const application: FrameworkApplication<
	readonly [typeof schema],
	readonly []
>
declare const outcome: DatabaseOperationOutcome<typeof operation>

test('preserves exact operation and result inference through native dispatch', () => {
	const stages = createNativeHookStages(application)

	expectTypeOf(stages.resolveInput({ context, operation })).toEqualTypeOf<
		MaybePromise<typeof operation>
	>()
	expectTypeOf(
		stages.fieldAfter({ context, operation, outcome }),
	).toEqualTypeOf<MaybePromise<DatabaseOperationOutcome<typeof operation>>>()
	expectTypeOf(
		stages.schemaAfter({ context, operation, result: outcome.result }),
	).toEqualTypeOf<MaybePromise<DatabaseOperationResult<typeof operation>>>()
})
