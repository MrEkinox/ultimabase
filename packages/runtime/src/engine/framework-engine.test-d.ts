import type {
	AnonymousRequestAccess,
	MasterRequestAccess,
	UserRequestAccess,
} from '@ultimabase/access'
import { FrameworkApplication } from '@ultimabase/core'
import type { BoundQuery, FindOperationAst } from '@ultimabase/query'
import { Query } from '@ultimabase/query'
import { Schema, stringField, type InferObject } from '@ultimabase/schema'
import { expectTypeOf, test } from 'vitest'

import type { DatabaseObjectRecord } from '../database/contracts.js'
import { MasterAuthority } from '../master/master-authority.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { FrameworkEngine, type RequestEngine } from './framework-engine.js'

const schema = new Schema({
	className: 'TypedArticle',
	fields: { title: stringField() },
})
const authorSchema = new Schema({
	className: 'TypedAuthor',
	fields: { name: stringField() },
})
const application = new FrameworkApplication({
	schemas: [schema],
	plugins: [],
})
const multiSchemaApplication = new FrameworkApplication({
	// A multi-schema application exercises the executor capability without widening results.
	schemas: [schema, authorSchema],
	plugins: [],
})

// The declaration fixture only needs a value with the already verified class type.
declare const pipeline: RuntimePipeline

const framework = new FrameworkEngine({
	application,
	pipeline,
})
const masterFramework = new FrameworkEngine({
	application,
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'typed', value: 'typed-secret' }],
		onUse: () => undefined,
	}),
	pipeline,
})
const multiSchemaFramework = new FrameworkEngine({
	application: multiSchemaApplication,
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

test('keeps bound terminal types exact in multi-schema applications', () => {
	const request = multiSchemaFramework.user('user-1', {
		requestId: 'multi-schema-1',
		source: 'graphql',
	})

	expectTypeOf(
		request.query(schema).create({ title: 'Typed article' }),
	).toEqualTypeOf<Promise<InferObject<typeof schema>>>()
})

test('retains trusted master request types through opaque grants', async () => {
	const request = masterFramework.anonymous({
		requestId: 'master-1',
		source: 'internal',
	})
	const grant = masterFramework.authorizeMasterKey('typed-secret')
	const master = await request.useMasterKey(grant, 'typed maintenance')

	expectTypeOf(master.context.access).toEqualTypeOf<MasterRequestAccess>()
	expectTypeOf(master.context.source).toEqualTypeOf<'internal'>()
	expectTypeOf(master).toExtend<RequestEngine>()
})
