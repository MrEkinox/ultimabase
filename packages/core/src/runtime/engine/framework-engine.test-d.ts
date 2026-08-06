import type {
	AnonymousRequestAccess,
	MasterRequestAccess,
} from '../../access/index.js'
import { RequestContextValue } from '../../access/index.js'
import { FrameworkApplication } from '../../foundation.js'
import type { FindOperationAst, InferQueryResult } from '../../query/index.js'
import { Query } from '../../query/index.js'
import { Schema, stringField } from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import { MasterAuthority } from '../master/master-authority.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { RequestContext } from '../context/request-context.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { FrameworkEngine, type RequestEngine } from './framework-engine.js'

const schema = Schema.define({
	className: 'TypedArticle',
	fields: { title: stringField() },
})
const authorSchema = Schema.define({
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
const principalValue = new RequestContextValue<string>(
	'fixture.principal',
	(value: unknown): string => {
		if (typeof value !== 'string') {
			throw new TypeError('Fixture principal must be a string')
		}

		return value
	},
)

test('preserves application, context, query, and operation result types', () => {
	const anonymous = framework.anonymous({
		requestId: 'anonymous-1',
		source: 'rest',
	})
	const scopedContext = RequestContext.anonymous({
		requestId: 'user-1',
		source: 'graphql',
	}).withValue(principalValue, 'user-1')
	const scoped = framework.withContext(scopedContext)
	const query = schema.query()
	const operation = {
		kind: 'find',
		query: new Query(schema).ast,
	} satisfies FindOperationAst<typeof schema>

	expectTypeOf(framework.application).toEqualTypeOf<typeof application>()
	expectTypeOf(anonymous.context.access).toEqualTypeOf<AnonymousRequestAccess>()
	expectTypeOf(anonymous.context.source).toEqualTypeOf<'rest'>()
	expectTypeOf(scoped.context.access).toEqualTypeOf<AnonymousRequestAccess>()
	expectTypeOf(scoped.context.getValue(principalValue)).toEqualTypeOf<
		string | undefined
	>()
	expectTypeOf(query).toEqualTypeOf<Query<typeof schema>>()
	expectTypeOf(scoped.execute(operation)).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof schema>[]>
	>()
	expectTypeOf(
		scoped.transaction((transaction) => {
			expectTypeOf(transaction).toEqualTypeOf<typeof scoped>()

			return { completed: true as const }
		}),
	).toEqualTypeOf<Promise<{ completed: true }>>()
})

test('keeps bound terminal types exact in multi-schema applications', () => {
	const request = multiSchemaFramework.anonymous({
		requestId: 'multi-schema-1',
		source: 'graphql',
	})

	expectTypeOf(
		runWithRequestEngine(request, () =>
			schema.create({ data: { title: 'Typed article' } }),
		),
	).toEqualTypeOf<Promise<InferQueryResult<typeof schema>>>()
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
