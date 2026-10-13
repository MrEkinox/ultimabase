import { onTestFinished } from 'vitest'
import { FrameworkError, UltimaBase, getCurrentRequest } from '@ultimabase/core'
import {
	GraphQLEnumType,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLScalarType,
	GraphQLSchema,
	GraphQLString,
	parse,
} from 'graphql'
import { describe, expect, it } from 'vitest'

import { graphqlPlugin } from './plugin.js'
import type { GraphqlExecutionLimits } from './connection-limits.js'
import { graphqlFixtureDatabasePlugin } from './test-application.test-support.js'
import { RequestContext, anonymous } from '@ultimabase/core/plugin'

const Hidden = UltimaBase.Schema.define({
	className: 'NetworklessHidden',
	fields: (field) => ({ value: field.string() }),
})

const customSchema = (): GraphQLSchema =>
	new GraphQLSchema({
		query: new GraphQLObjectType<unknown, unknown>({
			name: 'Query',
			fields: {
				context: {
					type: GraphQLString,
					resolve: (_source, _arguments, context) => {
						if (
							typeof context !== 'object' ||
							context === null ||
							Reflect.ownKeys(context).length !== 1
						) {
							throw new TypeError('unexpected resolver context')
						}
						const request: unknown = Reflect.get(context, 'request')
						if (!(request instanceof RequestContext)) {
							throw new TypeError('missing request context')
						}
						return getCurrentRequest() === request ? request.requestId : 'wrong'
					},
				},
				echo: {
					type: GraphQLString,
					args: { value: { type: GraphQLString } },
					resolve: (_source, arguments_) => {
						const untrusted: unknown = arguments_
						if (typeof untrusted !== 'object' || untrusted === null) return null
						const value: unknown = Reflect.get(untrusted, 'value')
						return value
					},
				},
				publicFailure: {
					type: GraphQLString,
					resolve: () => {
						throw new FrameworkError('PERMISSION_DENIED', 'private policy', {
							publicMessage: 'Denied safely.',
						})
					},
				},
				secretFailure: {
					type: GraphQLString,
					resolve: () => {
						throw new Error('database password secret')
					},
				},
				scalarFailure: {
					type: new GraphQLScalarType({
						name: 'NetworklessFailingScalar',
						serialize: () => {
							throw new Error('scalar implementation secret')
						},
					}),
					resolve: () => 'value',
				},
			},
		}),
	})

const createFixture = (limits: GraphqlExecutionLimits = {}) => {
	const application = new (UltimaBase.use(
		graphqlPlugin({
			publicWrites: true,
			default: false,
			limits,
			schemas: [customSchema()],
		}),
		graphqlFixtureDatabasePlugin,
	))({
		logger: false,
		schemas: [Hidden],
	})
	onTestFinished(() => application.dispose())
	return application
}

describe('GraphQL networkless execution', () => {
	it.each([
		['{ ...Missing }', 'Unknown fragment'],
		[
			'{ ...Cycle } fragment Cycle on Query { ...Cycle }',
			'Cannot spread fragment',
		],
		['{ value: context value: echo }', 'conflict'],
	] as const)(
		'rejects invalid field collection before resolvers: %s',
		async (source, message) => {
			const application = createFixture()
			await application.start()
			const graphql = application.plugin('@ultimabase/graphql-plugin')
			const context = anonymous(application, {
				requestId: 'invalid-collection',
				source: 'test',
			}).context
			let called = false
			const contextField = graphql.schema.getQueryType()?.getFields().context
			if (contextField === undefined)
				throw new TypeError('Missing fixture field')
			contextField.resolve = () => {
				called = true
				return 'unexpected'
			}
			for (const document of [source, parse(source)]) {
				const result = await graphql.execute({ context, document })
				expect(result).not.toHaveProperty('data')
				expect(result.errors?.[0]?.message).toContain(message)
			}
			expect(called).toBe(false)
		},
	)

	it('executes string and parsed documents in one exact request scope', async () => {
		const application = createFixture()
		await application.start()
		const graphql = application.plugin('@ultimabase/graphql-plugin')
		const context = anonymous(application, {
			requestId: 'networkless-context',
			source: 'test',
		}).context

		await expect(
			graphql.execute({ context, document: '{ context }' }),
		).resolves.toEqual({ data: { context: 'networkless-context' } })
		await expect(
			graphql.execute({
				context,
				document: parse('query Echo($value: String) { echo(value: $value) }'),
				operationName: 'Echo',
				variables: { value: 'hello' },
			}),
		).resolves.toEqual({ data: { echo: 'hello' } })
		expect(graphql.printSchema()).toContain('type Query')
		await application.dispose()
	})

	it('rejects foreign, forged, cancelled, stale, and disposed execution', async () => {
		const first = createFixture()
		const second = createFixture()
		await second.start()

		const foreign = anonymous(second, {
			requestId: 'foreign-context',
			source: 'test',
		}).context
		await second.dispose()
		await first.start()
		const graphql = first.plugin('@ultimabase/graphql-plugin')
		await expect(
			graphql.execute({ context: foreign, document: '{ context }' }),
		).rejects.toThrow()
		await expect(
			graphql.execute({
				context: { requestId: 'forged' } as never,
				document: '{ context }',
			}),
		).rejects.toThrow('real RequestContext')

		const controller = new AbortController()
		controller.abort()
		const cancelled = anonymous(first, {
			requestId: 'cancelled-context',
			signal: controller.signal,
			source: 'test',
		}).context
		await expect(
			graphql.execute({ context: cancelled, document: '{ context }' }),
		).rejects.toThrow()
		const stale = anonymous(first, {
			requestId: 'stale-context',
			source: 'test',
		}).context
		await first.stop()
		await expect(
			graphql.execute({ context: stale, document: '{ context }' }),
		).rejects.toThrow()
		await first.dispose()
		await expect(
			graphql.execute({ context: stale, document: '{ context }' }),
		).rejects.toThrow('disposed')
		await second.dispose()
	})

	it('preserves public failures and masks unknown resolver details', async () => {
		const application = createFixture()
		await application.start()
		const graphql = application.plugin('@ultimabase/graphql-plugin')
		const context = anonymous(application, {
			requestId: 'safe-custom-errors',
			source: 'test',
		}).context
		const result = await graphql.execute({
			context,
			document: '{ publicFailure secretFailure scalarFailure }',
		})

		expect(result.errors?.[0]).toMatchObject({
			extensions: {
				code: 'PERMISSION_DENIED',
				requestId: 'safe-custom-errors',
			},
			message: 'Denied safely.',
		})
		expect(result.errors?.[1]).toMatchObject({
			extensions: {
				code: 'INTERNAL_SERVER_ERROR',
				requestId: 'safe-custom-errors',
			},
			message: 'Unexpected error.',
		})
		expect(result.errors?.[2]).toMatchObject({
			extensions: {
				code: 'INTERNAL_SERVER_ERROR',
				requestId: 'safe-custom-errors',
			},
			message: 'Unexpected error.',
		})
		expect(JSON.stringify(result)).not.toMatch(
			/password|private policy|scalar implementation/u,
		)
		await application.dispose()
	})

	it.each([
		[
			{ maxAliases: 1 },
			'{ first: context second: context }',
			undefined,
			'alias limit',
		],
		[{ maxDepth: 1 }, '{ context { nested } }', undefined, 'depth limit'],
		[{ maxDocumentBytes: 5 }, '{ context }', undefined, 'byte limit'],
		[{ maxDocumentTokens: 2 }, '{ context }', undefined, 'token limit'],
		[{ maxRootFields: 1 }, '{ context echo }', undefined, 'root field limit'],
		[
			{ maxVariablesBytes: 8 },
			'query Echo($value: String) { echo(value: $value) }',
			{ value: 'too-large' },
			'variables byte limit',
		],
	] as const)(
		'enforces request safety: %s',
		async (limits, document, variables, message) => {
			const application = createFixture(limits)
			await application.start()
			const graphql = application.plugin('@ultimabase/graphql-plugin')
			const result = await graphql.execute({
				context: anonymous(application, {
					requestId: 'networkless-limit',
					source: 'test',
				}).context,
				document,
				...(variables === undefined ? {} : { variables }),
			})
			expect(result).not.toHaveProperty('data')
			expect(result.errors?.[0]?.message).toContain(message)
			await application.dispose()
		},
	)

	it('rejects cyclic variables, unsupported directives, and subscriptions', async () => {
		const application = createFixture()
		await application.start()
		const graphql = application.plugin('@ultimabase/graphql-plugin')
		const context = anonymous(application, {
			requestId: 'networkless-invalid',
			source: 'test',
		}).context
		const cyclic: Record<string, unknown> = {}
		cyclic.self = cyclic
		const unsupported: Record<string, unknown> = { value: undefined }
		const symbolic: Record<string, unknown> = {}
		Object.defineProperty(symbolic, Symbol('hidden'), { value: 'value' })
		for (const options of [
			{ context, document: '{ echo }', variables: cyclic },
			{ context, document: '{ echo }', variables: unsupported },
			{ context, document: '{ echo }', variables: symbolic },
			{ context, document: '{ context @defer }' },
			{ context, document: 'subscription { context }' },
		]) {
			const result = await graphql.execute(options)
			expect(result).not.toHaveProperty('data')
			expect(result.errors).toHaveLength(1)
		}
		await application.dispose()
	})

	// ADR-0333 amendment: only a transport with introspection off hides them.
	it('keeps GraphQL suggestions for direct server-side execution', async () => {
		const Status = new GraphQLEnumType({
			name: 'NetworklessStatus',
			values: { DRAFT: {}, PUBLISHED: {} },
		})
		const application = new (UltimaBase.use(
			graphqlPlugin({
				default: false,
				schemas: [
					new GraphQLSchema({
						query: new GraphQLObjectType({
							name: 'Query',
							fields: {
								byStatus: {
									type: GraphQLString,
									args: { status: { type: new GraphQLNonNull(Status) } },
									resolve: () => 'notes',
								},
							},
						}),
					}),
				],
			}),
			graphqlFixtureDatabasePlugin,
		))({ logger: false, schemas: [] })
		onTestFinished(() => application.dispose())
		await application.start()
		const result = await application
			.plugin('@ultimabase/graphql-plugin')
			.execute({
				context: anonymous(application, {
					requestId: 'networkless-suggestions',
					source: 'test',
				}).context,
				document:
					'query ($status: NetworklessStatus!) { byStatus(status: $status) }',
				variables: { status: 'DRAF' },
			})
		expect(result.errors?.map(({ message }) => message)).toStrictEqual([
			'Variable "$status" has invalid value: Value "DRAF" does not exist in "NetworklessStatus" enum. Did you mean the enum value "DRAFT"?',
		])
	})
})
