import { ACL, acl, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	definePlugin,
	defineSchemaExtension,
	getOperationSchema,
	protectedPolicy,
	provideCapability,
	provideRuntimeConstraint,
	resolveWhereInput,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

class AlternativeReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly requests: DatabaseOperationRequest[] = []

	constructor(private readonly result: unknown) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)
		return Promise.resolve(this.result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('Alternative policy fixture executes reads only')
	}
}

const databasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.alternative-policy.database',
		capabilities: {
			provides: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database-adapter',
					create: () => ({ value: adapter }),
				}),
			],
		},
	})

const alternativePolicy = defineSchemaExtension(
	'alternative-policy',
	{},
	'community.alternative-policy',
)
const publicRead = new ACL().grantPublic('read')
const AlternativeDocument = Schema.define({
	className: 'AlternativePolicyDocument',
	fields: (field) => ({
		secret: field.string(),
		tenant: field.string(),
		title: field.string(),
	}),
	extensions: [alternativePolicy, acl({ default: publicRead })],
})

const alternativePolicyPlugin = definePlugin({
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: 'community.alternative-policy',
	privileges: [
		{
			name: 'runtime:constrain',
			reason: 'Contributes an independent protected policy.',
		},
	],
	capabilities: {
		provides: [
			provideRuntimeConstraint({
				contributionId: 'alternative-policy',
				create: ({ schemas }) => {
					const protectedSchemas = new Set(
						schemas
							.values()
							.filter((schema) =>
								schema.extensions.some(
									(extension) =>
										extension.name === alternativePolicy.name &&
										extension.pluginName === alternativePolicy.pluginName,
								),
							),
					)

					return {
						value: protectedPolicy({
							evaluate: ({ operation }) => {
								const schema = getOperationSchema(operation)
								if (!Schema.is(schema) || !protectedSchemas.has(schema)) {
									return undefined
								}

								return {
									rowFilter: resolveWhereInput(schema, {
										tenant: { eq: 'community' },
									}),
									selectionFields: Object.keys(schema.fields).filter(
										(field) => field !== 'secret',
									),
								}
							},
						}),
					}
				},
			}),
		],
	},
})

describe('independent protected policy engine', () => {
	it('composes with ACL without importing or installing access-plugin', async () => {
		const adapter = new AlternativeReadAdapter([
			{
				acl: publicRead,
				createdAt: '2026-08-20T10:00:00.000Z',
				id: '019c0000-0000-7000-8000-000000000002',
				secret: 'hidden',
				tenant: 'community',
				title: 'visible',
				updatedAt: '2026-08-20T10:00:00.000Z',
			},
		])
		const ultimabase = new UltimaBase({
			plugins: [alternativePolicyPlugin, aclPlugin(), databasePlugin(adapter)],
			schemas: [AlternativeDocument],
		})

		try {
			await ultimabase.start()
			const result = await AlternativeDocument.findMany(undefined, {
				ultimabase,
			})

			expect(result[0]).not.toHaveProperty('acl')
			expect(result[0]).not.toHaveProperty('secret')
			const protectedRequest = adapter.requests.find(
				(request) => request.rowFilter !== undefined,
			)
			expect(JSON.stringify(protectedRequest?.rowFilter)).toContain('community')
		} finally {
			await ultimabase.dispose()
		}
	})
})
