import {
	MasterAuthority,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import {
	httpContextResolver,
	httpMasterKeyHeader,
	httpPlugin,
	provideHttpContextResolvers,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { describe, expect, it } from 'vitest'

import { graphqlYogaPlugin } from './plugin.js'
import {
	graphqlYogaFixtureHttpConsumer,
	readFixtureHttpApplication,
} from './test-application.test-support.js'
import {
	RequestContextValue,
	plugin,
	provideCapability,
} from '@ultimabase/core/plugin'

const viewer = new RequestContextValue<string>(
	'fixture.graphql-yoga.virtual-viewer',
	(value) => {
		if (typeof value !== 'string')
			throw new TypeError('Viewer must be a string')
		return value
	},
)

const VirtualYogaRecord = UltimaBase.Schema.define({
	className: 'GraphqlYogaVirtualRecord',
	fields: (field) => ({
		title: field.string(),
		summary: field.virtual({
			output: (output) =>
				output.object({
					fields: (nested) => ({
						authority: nested.string(),
						label: nested.string(),
						viewer: nested.string(),
					}),
				}),
			resolve: async ({ context, item }) => {
				await Promise.resolve()
				return {
					authority: context.access.mode,
					label: String(item.title).toUpperCase(),
					viewer: context.getValue(viewer) ?? 'anonymous',
				}
			},
			select: { title: true },
		}),
		broken: field.virtual({
			output: (output) => output.string(),
			resolve: () => {
				throw new Error('private Yoga virtual resolver secret')
			},
			select: { title: true },
		}),
		waiting: field.virtual({
			output: (output) => output.string(),
			resolve: ({ context }) =>
				new Promise<string>((_resolve, reject) => {
					context.signal.addEventListener(
						'abort',
						() => {
							reject(new Error(String(context.signal.reason)))
						},
						{ once: true },
					)
				}),
			select: { title: true },
		}),
	}),
})

class VirtualYogaDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		const row = {
			id: '01991f00-0000-7000-8000-000000000703',
			title: 'Yoga virtual',
		}
		const result: unknown = request.operation.kind === 'find-many' ? [row] : row
		return Promise.resolve(result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return Promise.reject(new TypeError('Yoga virtual fixture does not mutate'))
	}
}

const databasePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.graphql-yoga-virtual-database',
	version: '1.0.0',
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database',
			create: () => ({ value: new VirtualYogaDatabase() }),
		}),
	],
})

const contextPlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.graphql-yoga-virtual-context',
	version: '1.0.0',
	contributions: [
		provideHttpContextResolvers({
			contributionId: 'viewer',
			create: () =>
				httpContextResolver({
					resolve: ({ context, request }) => {
						const authorization = request.headers.get('Authorization')
						return authorization === null
							? context
							: context.withValue(viewer, authorization)
					},
				}),
		}),
	],
})

const createFixture = async (requestTimeoutMs?: number) => {
	const application = new (UltimaBase.use(
		databasePlugin,
		httpPlugin({
			appId: 'virtual-yoga',
			master: true,
			...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
		}),
		contextPlugin,
		graphqlPlugin({ publicWrites: true }),
		graphqlYogaPlugin(),
		graphqlYogaFixtureHttpConsumer,
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'graphql-yoga-master', value: 'master-secret' }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [VirtualYogaRecord],
	})
	await application.start()
	return {
		application,
		http: readFixtureHttpApplication(application),
	}
}

const request = (
	http: HttpApplication,
	query: string,
	headers: Readonly<Record<string, string>> = {},
): Promise<Response> => {
	const requestHeaders = new Headers({
		'Content-Type': 'application/json',
		...headers,
	})
	const originalHeaders: HttpOriginalHeader[] = [
		['X-UltimaBase-Application-Id', 'virtual-yoga'],
		...Object.entries(headers),
	]
	return http.fetch({
		originalHeaders,
		request: new Request('https://example.test/graphql', {
			body: JSON.stringify({ query }),
			headers: requestHeaders,
			method: 'POST',
		}),
	})
}

describe('GraphQL Yoga virtual fields', () => {
	it('preserves authenticated context and Master provenance', async () => {
		const fixture = await createFixture()
		for (const testCase of [
			{ authority: 'anonymous', headers: {}, viewer: 'anonymous' },
			{
				authority: 'anonymous',
				headers: { Authorization: 'Bearer member' },
				viewer: 'Bearer member',
			},
			{
				authority: 'master',
				headers: { [httpMasterKeyHeader]: 'master-secret' },
				viewer: 'anonymous',
			},
		] as const) {
			const response = await request(
				fixture.http,
				'{ findOneGraphqlYogaVirtualRecord { summary { authority label viewer } } }',
				testCase.headers,
			)
			const body: unknown = await response.json()
			expect(response.status, JSON.stringify(body)).toBe(200)
			expect(body).toEqual({
				data: {
					findOneGraphqlYogaVirtualRecord: {
						summary: {
							authority: testCase.authority,
							label: 'YOGA VIRTUAL',
							viewer: testCase.viewer,
						},
					},
				},
			})
		}
		await fixture.application.dispose()
	})

	it('masks resolver details through the GraphQL HTTP result', async () => {
		const fixture = await createFixture()
		const response = await request(
			fixture.http,
			'{ findOneGraphqlYogaVirtualRecord { broken } }',
		)
		const body: unknown = await response.json()
		expect(response.status).toBe(200)
		expect(body).toMatchObject({
			errors: [{ extensions: { code: 'INTERNAL_ERROR' } }],
		})
		expect(JSON.stringify(body)).not.toMatch(/private|resolver|secret|title/u)
		await fixture.application.dispose()
	})

	it('lets the HTTP deadline cancel a running Core virtual resolver', async () => {
		const fixture = await createFixture(10)
		const response = await request(
			fixture.http,
			'{ findOneGraphqlYogaVirtualRecord { waiting } }',
		)
		expect(response.status).toBe(408)
		expect(await response.json()).toMatchObject({
			error: { code: 'HTTP_REQUEST_TIMEOUT' },
		})
		await fixture.application.dispose()
	})
})
