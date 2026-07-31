import type {
	AnonymousRequestAccess,
	MasterRequestAccess,
	UserRequestAccess,
} from '@ultimabase/access'
import { FrameworkApplication } from '@ultimabase/core'
import type { BoundQuery, FindOperationAst } from '@ultimabase/query'
import { Query } from '@ultimabase/query'
import { defineSchema, stringField } from '@ultimabase/schema'
import { expectTypeOf, test } from 'vitest'

import type { DatabaseObjectRecord } from '../database/contracts.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import {
	createTrustedMasterRequestEngine,
	FrameworkEngine,
	type RequestEngine,
} from './framework-engine.js'

const schema = defineSchema({
	className: 'TypedArticle',
	fields: { title: stringField() },
})
const application = new FrameworkApplication({
	schemas: [schema],
	plugins: [],
})

// The declaration fixture only needs a value with the already verified class type.
declare const pipeline: RuntimePipeline

const framework = new FrameworkEngine({
	application,
	pipeline,
})

test('preserves application, context, query, and operation result types', () => {
	const anonymous = framework.anonymous({
		requestId: 'anonymous-1',
		source: 'rest',
	})
	const user = framework.user('user-1', {
		requestId: 'user-1',
		source: 'graphql',
	})
	const query = user.query(schema)
	const operation = {
		kind: 'find',
		query: new Query(schema).ast,
	} satisfies FindOperationAst<typeof schema>

	expectTypeOf(framework.application).toEqualTypeOf<typeof application>()
	expectTypeOf(anonymous.context.access).toEqualTypeOf<AnonymousRequestAccess>()
	expectTypeOf(anonymous.context.source).toEqualTypeOf<'rest'>()
	expectTypeOf(user.context.access).toEqualTypeOf<UserRequestAccess<'user-1'>>()
	expectTypeOf(query).toEqualTypeOf<
		BoundQuery<typeof schema, never, typeof user>
	>()
	expectTypeOf(user.execute(operation)).toEqualTypeOf<
		Promise<readonly DatabaseObjectRecord<typeof schema>[]>
	>()
	expectTypeOf(
		user.transaction((transaction) => {
			expectTypeOf(transaction).toEqualTypeOf<typeof user>()

			return { completed: true as const }
		}),
	).toEqualTypeOf<Promise<{ completed: true }>>()
})

test('retains the internal trusted master request type', () => {
	const master = createTrustedMasterRequestEngine(
		framework,
		'typed maintenance',
		{ requestId: 'master-1', source: 'internal' },
	)

	expectTypeOf(master.context.access).toEqualTypeOf<MasterRequestAccess>()
	expectTypeOf(master.context.source).toEqualTypeOf<'internal'>()
	expectTypeOf(master).toExtend<RequestEngine>()
})
