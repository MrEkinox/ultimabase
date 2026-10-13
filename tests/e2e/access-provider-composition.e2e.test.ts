import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	accessPlugin,
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import {
	RequestSubjectReference,
	UltimaBase,
	databaseAdapterCapability,
	databasePluginFieldStructuralContainsCapability,
	databasePersistencePlanCapability,
	databaseRelationCapability,
	databaseRelationPredicateCapability,
	type DatabaseAdapter,
	type DatabaseAdapterCapabilities,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type FrameworkError,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'
import { requestRoleResolverCapability } from '@ultimabase/plugin-kit'
import { plugin, provideCapability } from '@ultimabase/core/plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { hasRole, rolesPlugin } from '@ultimabase/roles-plugin'
import { describe, expect, it } from 'vitest'
import { testDatabaseFilterOperators } from '../../tooling/vitest/database-filter-operators.js'

const fixedInstant = '2026-08-04T00:00:00.000Z'
const editor = new RequestSubjectReference('role', 'fixture.editor')
const isEditor = hasRole(editor)

/** Records complete requests while returning one trusted logical fixture result. */
class CompositionReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities: DatabaseAdapterCapabilities
	readonly requests: DatabaseOperationRequest[] = []

	constructor(
		private readonly result: unknown,
		structuralContains = true,
	) {
		this.capabilities = {
			filterOperators: testDatabaseFilterOperators,
			persistencePlans: databasePersistencePlanCapability,
			// Role schemas declare relation fields (ADR-0301 startup check).
			relationPredicates: databaseRelationPredicateCapability,
			relations: databaseRelationCapability,
			...(structuralContains
				? {
						pluginFieldStructuralContains:
							databasePluginFieldStructuralContainsCapability,
					}
				: {}),
		}
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)

		// The fixture supplies an operation-compatible result and inspects policy state separately.
		return Promise.resolve(this.result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('Composition read adapter does not execute mutations')
	}
}

/** Proves policy failures happen before a mutation reaches adapter preparation. */
class CompositionWriteTransaction implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities = {
		filterOperators: testDatabaseFilterOperators,
		persistencePlans: databasePersistencePlanCapability,
		pluginFieldStructuralContains:
			databasePluginFieldStructuralContainsCapability,
	}
	prepareCount = 0
	rollbackCount = 0

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request

		return Promise.reject(
			new TypeError('Composition transaction does not execute reads'),
		)
	}

	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		void request
		this.prepareCount += 1

		return Promise.reject(
			new TypeError('Composition mutation unexpectedly reached preparation'),
		)
	}

	commit(): Promise<void> {
		return Promise.resolve()
	}

	rollback(): Promise<void> {
		this.rollbackCount += 1

		return Promise.resolve()
	}
}

class CompositionWriteAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities = {
		filterOperators: testDatabaseFilterOperators,
		persistencePlans: databasePersistencePlanCapability,
		pluginFieldStructuralContains:
			databasePluginFieldStructuralContainsCapability,
	}
	readonly transactions: CompositionWriteTransaction[] = []

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request

		return Promise.reject(
			new TypeError('Composition write adapter requires a transaction'),
		)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		const transaction = new CompositionWriteTransaction()

		this.transactions.push(transaction)

		return Promise.resolve(transaction)
	}
}

const databasePlugin = (adapter: DatabaseAdapter) =>
	plugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.composition.database',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database-adapter',
				create: () => ({ value: adapter }),
			}),
		],
	})

const AccessCompositionApplication =
	UltimaBase.use(accessPlugin()).use(hooksPlugin())

const NativeDocument = AccessCompositionApplication.Schema.define({
	className: 'AccessCompositionNativeDocument',
	fields: (field) => ({
		secret: field.string({ access: { read: false } }),
		title: field.string({ required: true }),
	}),
}).with({
	access: { read: true },
})

const Principal = AccessCompositionApplication.Schema.define({
	className: 'AccessCompositionPrincipal',
	fields: () => ({}),
})
// Declarations only: each test installs its own plugin list.
const ACLCompositionApplication = AccessCompositionApplication.use(
	aclPlugin(),
	rolesPlugin(),
)
const RoleOnly = ACLCompositionApplication.RoleSchema.define({
	className: 'AccessCompositionRoleOnly',
	members: () => Principal,
})
const ACLRole = ACLCompositionApplication.RoleSchema.define({
	className: 'AccessCompositionACLRole',
	members: () => Principal,
})
	.acl()
	.with({ acl: { default: new ACL() } })

const publicACL = new ACL().grantPublic('read')
const PublicACLPost = ACLCompositionApplication.Schema.define({
	className: 'AccessCompositionPublicACLPost',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})
	.acl()
	.with({ acl: { default: publicACL } })

const roleACL = new ACL().grantRole(editor, 'read')
const CombinedPost = ACLCompositionApplication.Schema.define({
	className: 'AccessCompositionPost',
	fields: (field) => ({
		businessScope: field.string(),
		communityScope: field.string(),
		nativeScope: field.string(),
		secret: field.string({ access: { read: false } }),
		title: field.string({ required: true }),
	}),
})
	.acl()
	// A callback defers role discovery so this fixture can prove runtime composition.
	.with({
		access: {
			read: async (input) =>
				(await isEditor(input)) &&
				input.where
					.eq('nativeScope', 'native-allowed')
					.eq('businessScope', 'business-allowed'),
		},
		acl: { default: () => roleACL },
	})

const createRoleProvider = (allowed: boolean) =>
	plugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'community.composition.roles',
		contributions: [
			provideCapability(requestRoleResolverCapability, {
				contributionId: 'role-resolver',
				create: () => ({
					value: {
						hasRole: ({ role }) => allowed && role.value === editor.value,
						resolveCurrentRoles: () => (allowed ? [editor] : []),
						resolvePersistentRole: ({ role }) => role,
					},
				}),
			}),
		],
	})

const communityPolicy = plugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'community.composition.policy',
	peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
	permissions: {
		'runtime:constrain': 'Contributes one monotonic community Access policy.',
	},
	contributions: [
		provideAccessContributions('community-scope', () =>
			schemaAccess(CombinedPost, {
				read: ({ where }) => where.eq('communityScope', 'community-allowed'),
			}),
		),
	],
})

const combinedRow = {
	acl: roleACL,
	businessScope: 'business-allowed',
	communityScope: 'community-allowed',
	createdAt: fixedInstant,
	id: '0198a43e-2431-7000-8000-000000000501',
	nativeScope: 'native-allowed',
	secret: 'hidden',
	title: 'developer-visible',
	updatedAt: fixedInstant,
}

interface CompositionSnapshot {
	readonly developerFilter: string
	readonly resultKeys: readonly string[]
	readonly rowFilter: string
}

/** Executes one public query through the flat combined plugin graph. */
const runCombinedComposition = async (): Promise<CompositionSnapshot> => {
	const adapter = new CompositionReadAdapter([combinedRow])
	const roleProvider = createRoleProvider(true)
	const aclProvider = aclPlugin()
	const database = databasePlugin(adapter)
	const access = accessPlugin()
	const plugins = [
		hooksPlugin(),
		access,
		roleProvider,
		communityPolicy,
		aclProvider,
		database,
	]
	const Application = UltimaBase.use(...plugins)
	const ultimabase = new Application({ schemas: [CombinedPost] })

	try {
		await ultimabase.start()
		const result = await CombinedPost.findMany({
			where: { title: { eq: 'developer-visible' } },
		})
		const request = adapter.requests[0]
		const operation = request?.operation

		if (request === undefined || operation?.kind !== 'find-many') {
			throw new TypeError('Composition fixture expected one find request')
		}
		const query: unknown = Reflect.get(operation, 'query')

		if (typeof query !== 'object' || query === null) {
			throw new TypeError('Composition fixture find request has no query AST')
		}
		const firstResult = result[0]

		if (firstResult === undefined) {
			throw new TypeError('Composition fixture expected one visible result')
		}

		expect(firstResult).not.toHaveProperty('acl')
		expect(firstResult).not.toHaveProperty('secret')

		return {
			developerFilter: JSON.stringify(Reflect.get(query, 'where')),
			resultKeys: Object.keys(firstResult).sort(),
			rowFilter: JSON.stringify(request.rowFilter),
		}
	} finally {
		await ultimabase.dispose()
	}
}

let roleAwareBusinessHooks = 0
const MissingRolePost = ACLCompositionApplication.Schema.define({
	className: 'AccessCompositionMissingRolePost',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})
	.acl()
	// Dynamic grants validate the absent provider before business or storage hooks.
	.with({
		hooks: {
			beforeOperation: {
				create: ({ item }) => {
					roleAwareBusinessHooks += 1
					void item
				},
			},
		},
		acl: { default: () => roleACL },
	})

describe('Access provider composition', () => {
	it('keeps native field Access complete without ACL or roles', async () => {
		const adapter = new CompositionReadAdapter([
			{
				createdAt: fixedInstant,
				id: '0198a43e-2431-7000-8000-000000000500',
				secret: 'hidden',
				title: 'native',
				updatedAt: fixedInstant,
			},
		])
		const ultimabase = new (UltimaBase.use(
			accessPlugin(),
			databasePlugin(adapter),
		))({ schemas: [NativeDocument] })

		try {
			await ultimabase.start()
			await expect(NativeDocument.findMany(undefined)).resolves.toEqual([
				expect.not.objectContaining({ secret: 'hidden' }),
			])
			await expect(
				NativeDocument.findMany({ select: { secret: true } }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			expect(adapter.requests).toHaveLength(1)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('keeps roles-only, ACL-only, and ACL-protected role schemas optional', async () => {
		const adapter = new CompositionReadAdapter([])
		const aclOnlyAdapter = new CompositionReadAdapter([
			{
				acl: publicACL,
				createdAt: fixedInstant,
				id: '0198a43e-2431-7000-8000-000000000502',
				title: 'public ACL',
				updatedAt: fixedInstant,
			},
		])
		const rolesOnly = new (UltimaBase.use(
			hooksPlugin(),
			rolesPlugin(),
			databasePlugin(adapter),
		))({ schemas: [Principal, RoleOnly] })
		const aclOnly = new (UltimaBase.use(
			hooksPlugin(),
			aclPlugin(),
			databasePlugin(aclOnlyAdapter),
		))({ schemas: [PublicACLPost] })
		const composed = new (UltimaBase.use(
			hooksPlugin(),
			rolesPlugin(),
			aclPlugin(),
			databasePlugin(new CompositionReadAdapter([])),
		))({
			schemas: [Principal, ACLRole],
		})

		try {
			await rolesOnly.start()
			expect(rolesOnly.state).toBe('started')
			await rolesOnly.dispose()
			await aclOnly.start()
			await expect(PublicACLPost.findMany(undefined)).resolves.toEqual([
				expect.objectContaining({ title: 'public ACL' }),
			])
			expect(aclOnly.state).toBe('started')
			await aclOnly.dispose()
			await composed.start()
			expect(composed.state).toBe('started')
		} finally {
			await Promise.all([
				rolesOnly.dispose(),
				aclOnly.dispose(),
				composed.dispose(),
			])
		}
	})

	it('fails before the adapter when plugin-field containment is unavailable', async () => {
		const adapter = new CompositionReadAdapter([], false)
		const ultimabase = new (UltimaBase.use(
			aclPlugin(),
			databasePlugin(adapter),
		))({ schemas: [PublicACLPost] })

		try {
			// ADR-0301: the static ACL `contains` need is refused at start.
			await expect(ultimabase.start()).rejects.toMatchObject({
				code: 'PLUGIN_ADAPTER_CAPABILITY_MISSING',
				internalDetails: { capability: 'plugin-field-structural-contains' },
			})
			expect(adapter.requests).toHaveLength(0)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('combines native, role, community, ACL, and business filters in one flat graph', async () => {
		const topLevel = await runCombinedComposition()
		expect(topLevel.developerFilter).toContain('developer-visible')
		expect(topLevel.developerFilter).not.toContain('business-allowed')
		expect(topLevel.rowFilter).toContain('native-allowed')
		expect(topLevel.rowFilter).toContain('business-allowed')
		expect(topLevel.rowFilter).toContain('community-allowed')
		expect(topLevel.rowFilter).toContain(editor.value)
		expect(topLevel.resultKeys).not.toContain('acl')
		expect(topLevel.resultKeys).not.toContain('secret')
	})

	it('fails closed before business or storage when a configured role capability is absent', async () => {
		const readAdapter = new CompositionReadAdapter([combinedRow])
		const readApplication = new (UltimaBase.use(
			hooksPlugin(),
			accessPlugin(),
			aclPlugin(),
			databasePlugin(readAdapter),
		))({ schemas: [CombinedPost] })
		const writeAdapter = new CompositionWriteAdapter()
		const writeApplication = new (UltimaBase.use(
			hooksPlugin(),
			aclPlugin(),
			databasePlugin(writeAdapter),
		))({ schemas: [MissingRolePost] })

		try {
			await readApplication.start()
			await expect(CombinedPost.findMany(undefined)).rejects.toMatchObject({
				code: 'PLUGIN_CAPABILITY_MISSING',
			} satisfies Partial<FrameworkError>)
			expect(readAdapter.requests).toHaveLength(0)

			await readApplication.dispose()
			await writeApplication.start()
			roleAwareBusinessHooks = 0
			await expect(
				MissingRolePost.createOne({ data: { title: 'missing provider' } }),
			).rejects.toThrow(
				'ACL role grants require a role resolver with current-role enumeration',
			)
			expect(roleAwareBusinessHooks).toBe(0)
			expect(writeAdapter.transactions).toHaveLength(1)
			expect(writeAdapter.transactions[0]).toMatchObject({
				prepareCount: 0,
				rollbackCount: 1,
			})
		} finally {
			await Promise.all([readApplication.dispose(), writeApplication.dispose()])
		}
	})

	it('keeps every independent denial monotonic with a compatible community provider', async () => {
		const adapter = new CompositionReadAdapter([combinedRow])
		const ultimabase = new (UltimaBase.use(
			hooksPlugin(),
			accessPlugin(),
			createRoleProvider(false),
			communityPolicy,
			aclPlugin(),
			databasePlugin(adapter),
		))({ schemas: [CombinedPost] })

		try {
			await ultimabase.start()
			await expect(CombinedPost.findMany(undefined)).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
			expect(adapter.requests).toHaveLength(0)
		} finally {
			await ultimabase.dispose()
		}
	})
})
