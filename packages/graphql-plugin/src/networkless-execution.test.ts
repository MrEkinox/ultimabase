import {
	FrameworkError,
	RequestContext,
	Schema,
	UltimaBase,
	getCurrentRequest,
} from '@ultimabase/core'
import {
	GraphQLObjectType,
	GraphQLScalarType,
	GraphQLSchema,
	GraphQLString,
	parse,
} from 'graphql'
import { describe, expect, it } from 'vitest'

import { graphqlPlugin } from './plugin.js'
import type { GraphqlExecutionLimits } from './connection-limits.js'
import type { GraphqlApplication } from './application.js'
import { graphqlFixtureDatabasePlugin } from './test-application.test-support.js'

const Hidden = Schema.define({
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

const createFixture = (limits: GraphqlExecutionLimits = {}) =>
	new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: [
			graphqlPlugin({
				acknowledgeUnverifiedProtection: true,
				default: false,
				limits,
				schemas: [customSchema()],
			}),
			graphqlFixtureDatabasePlugin,
		],
		schemas: [Hidden],
	})

describe('GraphQL networkless execution', () => {
	it('executes string and parsed documents in one exact request scope', async () => {
		const application = createFixture()
		await application.start()
		const graphql = application.application.getPlugin(
			'@ultimabase/graphql-plugin',
		) as GraphqlApplication
		const context = application.engine.anonymous({
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
		await Promise.all([first.start(), second.start()])
		const graphql = first.application.getPlugin(
			'@ultimabase/graphql-plugin',
		) as GraphqlApplication
		const foreign = second.engine.anonymous({
			requestId: 'foreign-context',
			source: 'test',
		}).context
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
		const cancelled = first.engine.anonymous({
			requestId: 'cancelled-context',
			signal: controller.signal,
			source: 'test',
		}).context
		await expect(
			graphql.execute({ context: cancelled, document: '{ context }' }),
		).rejects.toThrow()
		const stale = first.engine.anonymous({
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
		const graphql = application.application.getPlugin(
			'@ultimabase/graphql-plugin',
		) as GraphqlApplication
		const context = application.engine.anonymous({
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
			const graphql = application.application.getPlugin(
				'@ultimabase/graphql-plugin',
			) as GraphqlApplication
			const result = await graphql.execute({
				context: application.engine.anonymous({
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
		const graphql = application.application.getPlugin(
			'@ultimabase/graphql-plugin',
		) as GraphqlApplication
		const context = application.engine.anonymous({
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
})
