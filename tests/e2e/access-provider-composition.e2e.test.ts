import { ACL, acl, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	AccessSubjectReference,
	Schema,
	UltimaBase,
	accessRoleResolverServiceToken,
	databaseAdapterServiceToken,
	definePlugin,
	stringField,
	type DatabaseAdapter,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type FrameworkError,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'
import { RoleSchema, hasRole, rolesPlugin } from '@ultimabase/roles-plugin'
import { describe, expect, it } from 'vitest'

const fixedInstant = '2026-08-04T00:00:00.000Z'
const editor = new AccessSubjectReference('role', 'fixture.editor')

/** Records complete requests while returning one trusted logical fixture result. */
class CompositionReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly requests: DatabaseOperationRequest[] = []

	constructor(private readonly result: unknown) {}

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
	definePlugin({
		name: 'fixture.composition.database',
		slot: 'database-adapter',
		setup: ({ services }) => {
			services.provide(databaseAdapterServiceToken, adapter)
		},
	})

const NativeDocument = Schema.define({
	className: 'AccessCompositionNativeDocument',
	access: { operation: { read: true } },
	fields: {
		secret: stringField({ access: { read: false } }),
		title: stringField({ validation: { required: true } }),
	},
})

const Principal = Schema.define({
	className: 'AccessCompositionPrincipal',
	fields: {},
})
const RoleOnly = RoleSchema.define({
	className: 'AccessCompositionRoleOnly',
	fields: {},
	members: { schema: Principal },
})
const ACLRole = RoleSchema.define({
	className: 'AccessCompositionACLRole',
	fields: {},
	members: { schema: Principal },
	extensions: [acl()],
})

const publicACL = new ACL().grantPublic('read')
const PublicACLPost = Schema.define({
	className: 'AccessCompositionPublicACLPost',
	fields: { title: stringField({ validation: { required: true } }) },
	extensions: [acl({ default: publicACL })],
})

const roleACL = new ACL().grantRole(editor, 'read')
const CombinedPost = Schema.define({
	className: 'AccessCompositionPost',
	access: {
		filter: {
			read: ({ filter }) =>
				filter
					.equalTo('nativeScope', 'native-allowed')
					.equalTo('businessScope', 'business-allowed'),
		},
		operation: { read: hasRole(editor) },
	},
	fields: {
		businessScope: stringField(),
		communityScope: stringField(),
		nativeScope: stringField(),
		secret: stringField({ access: { read: false } }),
		title: stringField({ validation: { required: true } }),
	},
	// A callback defers role discovery so this fixture can prove runtime composition.
	extensions: [acl({ default: () => roleACL })],
})

const createRoleProvider = (allowed: boolean) =>
	definePlugin({
		name: 'community.composition.roles',
		setup: ({ services }) => {
			// The neutral token, not the plugin name, makes this provider compatible.
			services.provide(accessRoleResolverServiceToken, {
				hasRole: ({ role }) => allowed && role.value === editor.value,
				resolveCurrentRoles: () => (allowed ? [editor] : []),
				resolvePersistentRole: ({ role }) => role,
			})
		},
	})

const communityPolicy = definePlugin({
	name: 'community.composition.policy',
	setup: ({ access }) => {
		access.schema(
			'community-scope',
			CombinedPost,
			{
				filter: {
					read: ({ filter }) =>
						filter.equalTo('communityScope', 'community-allowed'),
				},
			},
			{ master: 'enforce' },
		)
	},
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
	readonly constraintKinds: readonly string[]
	readonly developerFilter: string
	readonly resultKeys: readonly string[]
	readonly rowFilter: string
}

/** Executes the same public query through top-level or nested plugin syntax. */
const runCombinedComposition = async (
	nested: boolean,
): Promise<CompositionSnapshot> => {
	const adapter = new CompositionReadAdapter([combinedRow])
	const roleProvider = createRoleProvider(true)
	const aclProvider = aclPlugin()
	const database = databasePlugin(adapter)
	const plugins = nested
		? [
				definePlugin({
					name: 'fixture.composition.bundle',
					plugins: [roleProvider, communityPolicy, aclProvider],
				}),
				database,
			]
		: [roleProvider, communityPolicy, aclProvider, database]
	const ultimabase = new UltimaBase({ plugins, schemas: [CombinedPost] })

	try {
		await ultimabase.start()
		const result = await CombinedPost.findMany(
			{ where: { title: { eq: 'developer-visible' } } },
			{ ultimabase },
		)
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
			constraintKinds: request.constraints.map(({ kind }) => kind),
			developerFilter: JSON.stringify(Reflect.get(query, 'where')),
			resultKeys: Object.keys(firstResult).sort(),
			rowFilter: JSON.stringify(request.rowFilter),
		}
	} finally {
		await ultimabase.dispose()
	}
}

let roleAwareBusinessHooks = 0
const MissingRolePost = Schema.define({
	className: 'AccessCompositionMissingRolePost',
	fields: { title: stringField({ validation: { required: true } }) },
	hooks: {
		beforeOperation: {
			create: ({ operation }) => {
				roleAwareBusinessHooks += 1
				void operation
			},
		},
	},
	// Dynamic grants validate the absent provider before business or storage hooks.
	extensions: [acl({ default: () => roleACL })],
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
		const ultimabase = new UltimaBase({
			plugins: [databasePlugin(adapter)],
			schemas: [NativeDocument],
		})

		try {
			await ultimabase.start()
			await expect(
				NativeDocument.findMany(undefined, { ultimabase }),
			).resolves.toEqual([expect.not.objectContaining({ secret: 'hidden' })])
			await expect(
				NativeDocument.findMany({ select: { secret: true } }, { ultimabase }),
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
		const rolesOnly = new UltimaBase({
			plugins: [rolesPlugin(), databasePlugin(adapter)],
			schemas: [Principal, RoleOnly],
		})
		const aclOnly = new UltimaBase({
			plugins: [aclPlugin(), databasePlugin(aclOnlyAdapter)],
			schemas: [PublicACLPost],
		})
		const composed = new UltimaBase({
			plugins: [
				rolesPlugin(),
				aclPlugin(),
				databasePlugin(new CompositionReadAdapter([])),
			],
			schemas: [Principal, ACLRole],
		})

		try {
			await Promise.all([rolesOnly.start(), aclOnly.start(), composed.start()])
			await expect(
				PublicACLPost.findMany(undefined, { ultimabase: aclOnly }),
			).resolves.toEqual([expect.objectContaining({ title: 'public ACL' })])
			expect(rolesOnly.state).toBe('started')
			expect(aclOnly.state).toBe('started')
			expect(composed.state).toBe('started')
		} finally {
			await Promise.all([
				rolesOnly.dispose(),
				aclOnly.dispose(),
				composed.dispose(),
			])
		}
	})

	it('combines native, role, community, ACL, and business filters identically when nested', async () => {
		const topLevel = await runCombinedComposition(false)
		const nested = await runCombinedComposition(true)

		expect(nested).toStrictEqual(topLevel)
		expect(topLevel.constraintKinds).toContain('ultimabase.acl.row')
		expect(topLevel.developerFilter).toContain('developer-visible')
		expect(topLevel.developerFilter).not.toContain('business-allowed')
		expect(topLevel.rowFilter).toContain('native-allowed')
		expect(topLevel.rowFilter).toContain('business-allowed')
		expect(topLevel.rowFilter).toContain('community-allowed')
		expect(topLevel.resultKeys).not.toContain('acl')
		expect(topLevel.resultKeys).not.toContain('secret')
	})

	it('fails closed before business or storage when a configured role capability is absent', async () => {
		const readAdapter = new CompositionReadAdapter([combinedRow])
		const readApplication = new UltimaBase({
			plugins: [aclPlugin(), databasePlugin(readAdapter)],
			schemas: [CombinedPost],
		})
		const writeAdapter = new CompositionWriteAdapter()
		const writeApplication = new UltimaBase({
			plugins: [aclPlugin(), databasePlugin(writeAdapter)],
			schemas: [MissingRolePost],
		})

		try {
			await Promise.all([readApplication.start(), writeApplication.start()])
			await expect(
				CombinedPost.findMany(undefined, { ultimabase: readApplication }),
			).rejects.toMatchObject({
				code: 'SERVICE_NOT_FOUND',
			} satisfies Partial<FrameworkError>)
			expect(readAdapter.requests).toHaveLength(0)

			roleAwareBusinessHooks = 0
			await expect(
				MissingRolePost.createOne(
					{ data: { title: 'missing provider' } },
					{ ultimabase: writeApplication },
				),
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
		const ultimabase = new UltimaBase({
			plugins: [
				createRoleProvider(false),
				communityPolicy,
				aclPlugin(),
				databasePlugin(adapter),
			],
			schemas: [CombinedPost],
		})

		try {
			await ultimabase.start()
			await expect(
				CombinedPost.findMany(undefined, { ultimabase }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			expect(adapter.requests).toHaveLength(0)
		} finally {
			await ultimabase.dispose()
		}
	})
})
