import {
	RequestSubjectReference,
	QueryBuilder,
	requestPrincipalResolverCapability,
	requestRoleResolverCapability,
	databaseAdapterCapability,
	databasePluginFieldStructuralContainsCapability,
	databasePersistencePlanCapability as planCapability,
	plugin,
	provideCapability,
	UltimaBase,
	type DatabaseAdapter,
	type RequestPrincipalResolver,
	type RequestRoleResolver,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PluginDefinition,
	type PreparedDatabaseOperation,
	type RequestSubjectContext,
} from '@ultimabase/core'

import { ACL } from '../../src/acl.js'

import { aclPlugin } from '../../src/plugin.js'

export const databaseAdapterProvider = (adapter: DatabaseAdapter) =>
	provideCapability(databaseAdapterCapability, {
		contributionId: 'database-adapter',
		create: () => ({ value: adapter }),
	})
export const principalResolverProvider = (resolver: RequestPrincipalResolver) =>
	provideCapability(requestPrincipalResolverCapability, {
		contributionId: 'principal-resolver',
		create: () => ({ value: resolver }),
	})
export const roleResolverProvider = (resolver: RequestRoleResolver) =>
	provideCapability(requestRoleResolverCapability, {
		contributionId: 'role-resolver',
		create: () => ({ value: resolver }),
	})
export const context = Object.freeze({
	access: { mode: 'anonymous' },
	requestId: 'acl-test',
}) as unknown as RequestSubjectContext
export const masterContext = Object.freeze({
	access: { mode: 'master' },
	requestId: 'acl-master-test',
}) as unknown as RequestSubjectContext
const ACLSchemaApplication = UltimaBase.use(aclPlugin())
export const ProtectedPost = ACLSchemaApplication.Schema.define({
	className: 'ProtectedPluginPost',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
	acl: {},
})
export const protectedPostNode = new QueryBuilder(ProtectedPost).ast.schema
export const aclAdapterCapabilities = {
	persistencePlans: planCapability,
	pluginFieldStructuralContains:
		databasePluginFieldStructuralContainsCapability,
}

export class ACLReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = aclAdapterCapabilities
	readonly requests: DatabaseOperationRequest[] = []

	constructor(private readonly result: unknown) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)

		return Promise.resolve(this.result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('ACL read fixture does not execute mutations')
	}
}

export class ACLRejectedWriteTransaction implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities = aclAdapterCapabilities
	prepareCount = 0
	commitCount = 0
	rollbackCount = 0

	constructor(
		private readonly preparedTarget?: Readonly<Record<string, unknown>>,
	) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request

		return Promise.reject(
			new TypeError('ACL limit fixture does not execute transaction reads'),
		)
	}

	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		void request
		this.prepareCount += 1

		if (
			this.preparedTarget !== undefined &&
			(request.operation.kind === 'update-one' ||
				request.operation.kind === 'upsert-one')
		) {
			const prepared = {
				execute: () =>
					Promise.reject(
						new TypeError('ACL limit fixture stops before database execution'),
					),
				target: this.preparedTarget,
			}

			return Promise.resolve(
				prepared as unknown as PreparedDatabaseOperation<TOperation>,
			)
		}

		return Promise.reject(
			new TypeError('ACL limit fixture stops after adapter preparation'),
		)
	}

	commit(): Promise<void> {
		this.commitCount += 1

		return Promise.resolve()
	}

	rollback(): Promise<void> {
		this.rollbackCount += 1

		return Promise.resolve()
	}
}

export class ACLRejectedWriteAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = aclAdapterCapabilities
	readonly transactions: ACLRejectedWriteTransaction[] = []

	constructor(
		private readonly preparedTarget?: Readonly<Record<string, unknown>>,
	) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request

		return Promise.reject(
			new TypeError('ACL limit fixture only accepts automatic transactions'),
		)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		const transaction = new ACLRejectedWriteTransaction(this.preparedTarget)
		this.transactions.push(transaction)

		return Promise.resolve(transaction)
	}
}

type RoleProviderPlacement = 'after' | 'before'

export const createRoleProviderFixture = (
	suffix: string,
	placement: RoleProviderPlacement,
) => {
	const role = new RequestSubjectReference('role', `fixture-role-${suffix}`)
	const adapter = new ACLReadAdapter([
		{
			acl: new ACL().grantRole(role, 'read'),
			createdAt: '2026-08-04T00:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000041',
			title: suffix,
			updatedAt: '2026-08-04T00:00:00.000Z',
		},
	])
	const roleProvider = plugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: `fixture.acl-role-provider.${suffix}`,
		contributions: [
			roleResolverProvider({
				hasRole: ({ role: candidate }) => candidate.value === role.value,
				resolveCurrentRoles: () => [role],
				resolvePersistentRole: ({ role: candidate }) => candidate,
			}),
		],
	})
	const databaseProvider = plugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: `fixture.acl-role-database.${suffix}`,
		contributions: [databaseAdapterProvider(adapter)],
	})
	const aclProvider = aclPlugin()
	let plugins: readonly PluginDefinition[]

	switch (placement) {
		case 'after':
			plugins = [aclProvider, roleProvider, databaseProvider]
			break
		case 'before':
			plugins = [roleProvider, aclProvider, databaseProvider]
			break
	}

	const Application = UltimaBase.use(...plugins)
	const ultimabase = new Application({ schemas: [ProtectedPost] })
	return { adapter, role, ultimabase }
}
