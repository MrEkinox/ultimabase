import {
	afterOperation,
	beforeOperation,
	definePlugin,
	guard,
	postCommitEvent,
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	provideRuntimeObserver,
	replaceRuntime,
	RuntimePipeline,
	Schema,
	type RuntimeExecutorFactory,
} from '../../src/index.js'

const schema = Schema.define({
	className: 'PackedRuntimeCapability',
	fields: (field) => ({ title: field.string() }),
})

const interceptor = provideRuntimeInterceptor({
	contributionId: 'typed-interceptor',
	create: () => ({
		value: afterOperation({
			handler: ({ operation, result }) => {
				const exactOperation: 'find-many' = operation.kind
				const correlatedRows: readonly unknown[] = result
				// @ts-expect-error A find-many result cannot be treated as one scalar value.
				const scalarResult: string = result

				void exactOperation
				void correlatedRows
				void scalarResult
				return { result }
			},
			operations: ['find-many'],
			schema,
		}),
	}),
})

const constraint = provideRuntimeConstraint({
	contributionId: 'typed-constraint',
	create: () => ({
		value: guard({
			handler: ({ operation }) => {
				const exactOperation: 'create-one' = operation.kind
				void exactOperation
			},
			operations: ['create-one'],
			schema,
		}),
	}),
})

const observer = provideRuntimeObserver({
	contributionId: 'typed-observer',
	create: () => ({
		value: postCommitEvent({
			handler: ({ operation }) => {
				const exactOperation: 'create-one' = operation.kind
				void exactOperation
			},
			operations: ['create-one'],
			schema,
		}),
	}),
})

const replacement = replaceRuntime({
	contributionId: 'typed-replacement',
	create: () => ({
		value: (stages) => new RuntimePipeline(stages),
	}),
})

definePlugin({
	pluginId: 'fixture.packed-runtime-capabilities',
	version: '0.0.0',
	core: '^0.0.0',
	privileges: [
		{ name: 'runtime:constrain', reason: 'Exercises the packed facade.' },
		{ name: 'runtime:intercept', reason: 'Exercises the packed facade.' },
		{ name: 'runtime:observe', reason: 'Exercises the packed facade.' },
		{ name: 'runtime:replace', reason: 'Exercises the packed facade.' },
	],
	capabilities: {
		provides: [interceptor, constraint, observer],
		replaces: [replacement],
	},
})

beforeOperation({ handler: () => undefined })
type InspectedExecutorFactory =
	/* hover:runtime-executor */ RuntimeExecutorFactory

void (undefined as unknown as InspectedExecutorFactory)
