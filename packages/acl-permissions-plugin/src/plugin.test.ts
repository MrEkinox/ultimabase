import type { FrameworkError } from '@ultimabase/core'
import {
	AccessSubjectReference,
	MasterAuthority,
	Pointer,
	QueryBuilder,
	Schema,
	accessPrincipalResolverServiceToken,
	accessRoleResolverServiceToken,
	createApplication,
	databaseAdapterServiceToken,
	definePlugin,
	defineSchemaExtension,
	stringField,
	UltimaBase,
	type DatabaseAdapter,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type HookContext,
	type PluginDefinition,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import { ACL } from './acl.js'
import { acl, type ACLDefaultInput } from './acl-extension.js'
import {
	aclPlugin,
	resolveCreateOperationACL,
	resolvePreparedOperationACL,
} from './plugin.js'

const context = Object.freeze({
	access: { mode: 'anonymous' },
	requestId: 'acl-test',
}) as unknown as HookContext
const masterContext = Object.freeze({
	access: { mode: 'master' },
	requestId: 'acl-master-test',
}) as unknown as HookContext
const ProtectedPost = Schema.define({
	className: 'ProtectedPluginPost',
	fields: { title: stringField({ validation: { required: true } }) },
	extensions: [acl()],
})
const protectedPostNode = new QueryBuilder(ProtectedPost).ast.schema

class ACLReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly requests: DatabaseOperationRequest[] = []

	constructor(private readonly result: unknown) {}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)

		// The fixture returns the exact logical shape supplied by its test case.
		return Promise.resolve(this.result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('ACL read fixture does not execute mutations')
	}
}

class ACLRejectedWriteTransaction implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
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

			// The discriminant above proves the conditional prepared-target contract.
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

class ACLRejectedWriteAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
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

type RoleProviderPlacement = 'after' | 'before' | 'nested'

/** Builds isolated applications that expose provider-order regressions through row constraints. */
const createRoleProviderFixture = (
	suffix: string,
	placement: RoleProviderPlacement,
) => {
	const role = new AccessSubjectReference('role', `fixture-role-${suffix}`)
	const adapter = new ACLReadAdapter([
		{
			acl: new ACL().grantRole(role, 'read'),
			createdAt: '2026-08-04T00:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000041',
			title: suffix,
			updatedAt: '2026-08-04T00:00:00.000Z',
		},
	])
	const roleProvider = definePlugin({
		name: `fixture.acl-role-provider.${suffix}`,
		setup: ({ services }) => {
			services.provide(accessRoleResolverServiceToken, {
				hasRole: ({ role: candidate }) => candidate.value === role.value,
				resolveCurrentRoles: () => [role],
				resolvePersistentRole: ({ role: candidate }) => candidate,
			})
		},
	})
	const databaseProvider = definePlugin({
		name: `fixture.acl-role-database.${suffix}`,
		slot: 'database-adapter',
		setup: ({ services }) => {
			services.provide(databaseAdapterServiceToken, adapter)
		},
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
		case 'nested':
			plugins = [
				aclProvider,
				definePlugin({
					name: `fixture.acl-role-parent.${suffix}`,
					plugins: [roleProvider],
				}),
				databaseProvider,
			]
			break
	}

	return {
		adapter,
		role,
		ultimabase: new UltimaBase({ plugins, schemas: [ProtectedPost] }),
	}
}

describe('aclPlugin create input resolution', () => {
	it('normalizes finite application defaults without complicating zero-option setup', () => {
		expect(() => aclPlugin()).not.toThrow()
		expect(() =>
			aclPlugin({ limits: { maxPrincipals: 100, maxRoles: 50 } }),
		).not.toThrow()
		expect(() => aclPlugin({ limits: { maxPrincipals: -1 } })).toThrow(
			'aclPlugin limits.maxPrincipals must be a non-negative safe integer',
		)
		expect(() => aclPlugin({ extra: true } as never)).toThrow(
			'Unknown aclPlugin option: extra',
		)
	})

	it('requires the owning plugin only when a schema declares acl()', async () => {
		await expect(
			createApplication({ schemas: [ProtectedPost], plugins: [] }),
		).rejects.toMatchObject({
			code: 'PLUGIN_EXTENSION_HANDLER_MISSING',
		} satisfies Partial<FrameworkError>)

		const application = await createApplication({
			schemas: [ProtectedPost],
			plugins: [aclPlugin()],
		})

		expect(application.getPlugin('ultimabase.acl').schemas).toStrictEqual([
			ProtectedPost,
		])
	})

	it('adds private row constraints, hides ACL output, and resolves the principal once', async () => {
		const Principal = Schema.define({
			className: 'ACLPluginPrincipal',
			fields: {},
		})
		const currentPrincipal = new Pointer(
			Principal,
			'0198a43e-2431-7000-8000-000000000021',
		)
		const storedACL = new ACL().grantPrincipal(currentPrincipal, 'read')
		const adapter = new ACLReadAdapter([
			{
				acl: storedACL,
				createdAt: '2026-08-04T00:00:00.000Z',
				id: '0198a43e-2431-7000-8000-000000000022',
				title: 'Visible',
				updatedAt: '2026-08-04T00:00:00.000Z',
			},
		])
		const resolveCurrent = vi.fn(() => currentPrincipal)
		const identityProvider = definePlugin({
			name: 'fixture.acl-principal-provider',
			setup: ({ services }) => {
				services.provide(accessPrincipalResolverServiceToken, {
					resolveCurrent,
				})
			},
		})
		const databaseProvider = definePlugin({
			name: 'fixture.acl-read-database',
			slot: 'database-adapter',
			setup: ({ services }) => {
				services.provide(databaseAdapterServiceToken, adapter)
			},
		})
		const ultimabase = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'acl-test-master', value: 'unused-by-terminal' }],
				onUse: () => undefined,
			}),
			plugins: [aclPlugin(), identityProvider, databaseProvider],
			schemas: [Principal, ProtectedPost],
		})

		try {
			await ultimabase.start()
			const result = await ProtectedPost.findMany(undefined, { ultimabase })

			// Non-master callers may use ACL grants without receiving the security document.
			expect(result[0]?.acl).toBeUndefined()
			expect(adapter.requests[0]?.constraints).toMatchObject([
				{
					kind: 'ultimabase.acl.row',
					payload: {
						permission: 'read',
						principalClassName: Principal.className,
						principalId: currentPrincipal.id,
					},
					version: 1,
				},
			])
			expect(resolveCurrent).toHaveBeenCalledOnce()
			await expect(
				ProtectedPost.findMany({ select: { acl: true } }, { ultimabase }),
			).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
				internalDetails: {
					fieldPath: ['acl'],
					phase: 'access-field-read',
				},
			} satisfies Partial<FrameworkError>)
			expect(adapter.requests).toHaveLength(1)
			const masterResult = await ProtectedPost.findMany(undefined, {
				ultimabase,
				useMasterKey: true,
			})
			expect(masterResult[0]?.acl).toBe(storedACL)
			expect(adapter.requests[1]?.constraints).toStrictEqual([])
		} finally {
			await ultimabase.dispose()
		}
	})

	it('resolves optional role providers after setup in every configuration order', async () => {
		const fixtures = (
			[
				['after', 'after'],
				['before', 'before'],
				['nested', 'nested'],
			] as const
		).map(([suffix, placement]) => createRoleProviderFixture(suffix, placement))

		try {
			await Promise.all(fixtures.map(({ ultimabase }) => ultimabase.start()))
			await Promise.all(
				fixtures.map(({ ultimabase }) =>
					ProtectedPost.findMany(undefined, { ultimabase }),
				),
			)

			for (const { adapter, role } of fixtures) {
				expect(adapter.requests[0]?.constraints).toMatchObject([
					{
						kind: 'ultimabase.acl.row',
						payload: {
							roleResolutionAvailable: true,
							roles: [role.value],
						},
						version: 1,
					},
				])
			}
		} finally {
			await Promise.all(fixtures.map(({ ultimabase }) => ultimabase.dispose()))
		}
	})

	it('requires a provider during setup for statically declared role grants', async () => {
		const StaticRolePost = Schema.define({
			className: 'ACLStaticRoleRequirementPost',
			fields: { title: stringField() },
			extensions: [
				acl({
					default: new ACL().grantRole(
						new AccessSubjectReference('role', 'fixture-static-role'),
						'read',
					),
				}),
			],
		})
		let infrastructureStarted = false
		const infrastructure = definePlugin({
			name: 'fixture.acl-static-role-infrastructure',
			hooks: {
				connect: () => {
					infrastructureStarted = true
				},
			},
		})
		const ultimabase = new UltimaBase({
			plugins: [aclPlugin(), infrastructure],
			schemas: [StaticRolePost],
		})

		await expect(ultimabase.start()).rejects.toMatchObject({
			code: 'SERVICE_NOT_FOUND',
			internalDetails: {
				requiredBy: 'ultimabase.acl',
				service: 'ultimabase.access.role-resolver',
			},
		} satisfies Partial<FrameworkError>)
		expect(infrastructureStarted).toBe(false)

		const roleProvider = definePlugin({
			name: 'fixture.acl-static-role-provider',
			setup: ({ services }) => {
				services.provide(accessRoleResolverServiceToken, {
					hasRole: () => false,
					resolveCurrentRoles: () => [],
					resolvePersistentRole: ({ role }) => role,
				})
			},
		})
		const resolved = await createApplication({
			plugins: [aclPlugin(), roleProvider],
			schemas: [StaticRolePost],
		})

		expect(resolved.state).toBe('ready')
		await resolved.dispose()
	})

	it('rejects dynamically produced role grants before adapter preparation', async () => {
		const dynamicRole = new AccessSubjectReference(
			'role',
			'fixture-dynamic-role',
		)
		const DynamicRolePost = Schema.define({
			className: 'ACLDynamicRoleRequirementPost',
			fields: { title: stringField() },
			extensions: [
				acl({ default: () => new ACL().grantRole(dynamicRole, 'read') }),
			],
		})
		const adapter = new ACLRejectedWriteAdapter()
		const databaseProvider = definePlugin({
			name: 'fixture.acl-dynamic-role-database',
			slot: 'database-adapter',
			setup: ({ services }) => {
				services.provide(databaseAdapterServiceToken, adapter)
			},
		})
		const ultimabase = new UltimaBase({
			plugins: [aclPlugin(), databaseProvider],
			schemas: [DynamicRolePost],
		})

		try {
			await ultimabase.start()
			await expect(
				DynamicRolePost.createOne(
					{ data: { title: 'Dynamic' } },
					{ ultimabase },
				),
			).rejects.toThrow(
				'ACL role grants require a role resolver with current-role enumeration',
			)
			expect(adapter.transactions).toHaveLength(1)
			expect(adapter.transactions[0]).toMatchObject({
				prepareCount: 0,
				rollbackCount: 1,
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('derives one ACL from resolved row data without exposing the reserved field', async () => {
		const generated = new ACL().grantPublic('read')
		const defaultFactory = vi.fn(({ data }) => {
			expect(data).toStrictEqual({ title: 'Visible' })

			return generated
		})
		const extension = acl({ default: defaultFactory })
		const operation = {
			input: { title: 'Visible' },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: protectedPostNode,
		} as const

		const resolved = await resolveCreateOperationACL(
			operation,
			extension.config,
			undefined,
			context,
		)

		expect(resolved.input).toStrictEqual({ title: 'Visible', acl: generated })
		expect(defaultFactory).toHaveBeenCalledOnce()
		expect(operation.input).not.toHaveProperty('acl')
	})

	it('keeps extension-reserved fields out of schema-local ACL data', async () => {
		const privateField = stringField({ validation: { required: true } })
		const privateExtension = defineSchemaExtension(
			'fixture.private-contextual-data',
			{},
			'fixture.private-contextual-plugin',
			{ fields: { privateValue: privateField } },
		)
		const extension = acl()
		const PrivatePost = Schema.define({
			className: 'ACLPrivateContextualPost',
			fields: { title: stringField({ validation: { required: true } }) },
			extensions: [privateExtension, extension],
		})
		const defaultFactory = vi.fn(({ data }: ACLDefaultInput) =>
			Object.keys(data).length === 1 && data.title === 'Visible'
				? new ACL().grantPublic('read')
				: new ACL(),
		)
		const operation = {
			input: { privateValue: 'plugin-owned', title: 'Visible' },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(PrivatePost).ast.schema,
		} as const

		await resolveCreateOperationACL(
			operation,
			acl({ default: defaultFactory }).config,
			undefined,
			context,
		)

		expect(defaultFactory).toHaveBeenCalledWith(
			expect.objectContaining({ data: { title: 'Visible' } }),
		)
	})

	it('runs asynchronous defaults independently for every create-many item', async () => {
		const defaultFactory = vi.fn(
			({ data }: ACLDefaultInput<{ readonly title: string }>) =>
				Promise.resolve(
					new ACL().grantPublic(data.title === 'First' ? 'read' : 'delete'),
				),
		)
		const extension = acl({ default: defaultFactory })
		const operation = {
			inputs: [{ title: 'First' }, { title: 'Second' }],
			kind: 'create-many',
			selection: new QueryBuilder(ProtectedPost).ast.selection,
			schema: protectedPostNode,
		} as const

		const resolved = await resolveCreateOperationACL(
			operation,
			extension.config,
			undefined,
			context,
		)

		expect(defaultFactory).toHaveBeenCalledTimes(2)
		const firstACL: unknown = Reflect.get(resolved.inputs[0], 'acl')
		const secondACL: unknown = Reflect.get(resolved.inputs[1], 'acl')

		expect(firstACL).toBeInstanceOf(ACL)
		expect(secondACL).toBeInstanceOf(ACL)
		if (!(firstACL instanceof ACL) || !(secondACL instanceof ACL)) {
			throw new TypeError('Resolved create-many items must contain ACL values')
		}
		expect(firstACL.permissionsForPublic()).toStrictEqual(['read'])
		expect(secondACL.permissionsForPublic()).toStrictEqual(['delete'])
	})

	it('checks static and asynchronous defaults before persistence', async () => {
		const Principal = Schema.define({
			className: 'ACLDefaultLimitPrincipal',
			fields: {},
		})
		const oversized = new ACL()
			.grantPrincipal(Principal.pointer('first'), 'read')
			.grantPrincipal(Principal.pointer('second'), 'read')
		const operation = {
			input: { title: 'Oversized' },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: protectedPostNode,
		} as const
		const limits = { maxPrincipals: 1, maxRoles: 50 }

		await expect(
			resolveCreateOperationACL(
				operation,
				acl({ default: oversized }).config,
				undefined,
				context,
				false,
				limits,
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			internalDetails: { kind: 'acl-entry-limit', subject: 'principal' },
		} satisfies Partial<FrameworkError>)
		await expect(
			resolveCreateOperationACL(
				operation,
				acl({ default: () => Promise.resolve(oversized) }).config,
				undefined,
				context,
				false,
				limits,
			),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	})

	it('rolls back oversized batches and honors a wider schema override', async () => {
		const Principal = Schema.define({
			className: 'ACLBatchLimitPrincipal',
			fields: {},
		})
		const twoPrincipals = new ACL()
			.grantPrincipal(Principal.pointer('first'), 'read')
			.grantPrincipal(Principal.pointer('second'), 'read')
		const BatchPost = Schema.define({
			className: 'ACLBatchLimitPost',
			fields: { title: stringField({ validation: { required: true } }) },
			extensions: [
				acl({
					default: ({ data }) => {
						const value = new ACL().grantPrincipal(
							Principal.pointer('first'),
							'read',
						)

						return data.title === 'Oversized'
							? value.grantPrincipal(Principal.pointer('second'), 'read')
							: value
					},
				}),
			],
		})
		const OverridePost = Schema.define({
			className: 'ACLSchemaLimitOverridePost',
			fields: { title: stringField({ validation: { required: true } }) },
			extensions: [
				acl({
					default: twoPrincipals,
					limits: { maxPrincipals: 2 },
				}),
			],
		})
		const adapter = new ACLRejectedWriteAdapter()
		const databaseProvider = definePlugin({
			name: 'fixture.acl-limit-write-database',
			slot: 'database-adapter',
			setup: ({ services }) => {
				services.provide(databaseAdapterServiceToken, adapter)
			},
		})
		const ultimabase = new UltimaBase({
			plugins: [aclPlugin({ limits: { maxPrincipals: 1 } }), databaseProvider],
			schemas: [Principal, BatchPost, OverridePost],
		})

		try {
			await ultimabase.start()
			await expect(
				BatchPost.createMany(
					{ data: [{ title: 'Oversized' }, { title: 'Accepted' }] },
					{
						ultimabase,
					},
				),
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				internalDetails: { kind: 'acl-entry-limit' },
			} satisfies Partial<FrameworkError>)

			expect(adapter.transactions).toHaveLength(1)
			expect(adapter.transactions[0]).toMatchObject({
				commitCount: 0,
				prepareCount: 0,
				rollbackCount: 1,
			})

			await expect(
				OverridePost.createOne(
					{ data: { title: 'Schema override' } },
					{ ultimabase },
				),
			).rejects.toThrow('ACL limit fixture stops after adapter preparation')
			expect(adapter.transactions[1]).toMatchObject({
				commitCount: 0,
				prepareCount: 1,
				rollbackCount: 1,
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('requires current-role enumeration before accepting role-aware values', async () => {
		const persistentRole = new AccessSubjectReference(
			'role',
			'AppRole:0198a43e-2431-7000-8000-000000000040',
		)
		const roleAware = new ACL()
			.grantRole(new AccessSubjectReference('role', 'AppRole:editor'), 'read')
			.grantRole(
				new AccessSubjectReference('role', 'AppRole:authors'),
				'update',
			)
		const operation = {
			input: { title: 'Role protected' },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: protectedPostNode,
		} as const

		await expect(
			resolveCreateOperationACL(
				operation,
				acl({ default: roleAware }).config,
				undefined,
				context,
			),
		).rejects.toThrow(
			'ACL role grants require a role resolver with current-role enumeration',
		)
		await expect(
			resolveCreateOperationACL(
				operation,
				acl({ default: roleAware }).config,
				undefined,
				context,
				true,
			),
		).rejects.toThrow(
			'ACL role grants require a role resolver with persistent-role resolution',
		)
		const resolved = await resolveCreateOperationACL(
			operation,
			acl({ default: roleAware }).config,
			undefined,
			context,
			true,
			undefined,
			() => persistentRole,
		)
		const storedACL: unknown = Reflect.get(resolved.input, 'acl')

		expect(storedACL).toBeInstanceOf(ACL)
		if (!(storedACL instanceof ACL)) {
			throw new TypeError('Resolved create input must contain an ACL')
		}
		expect(storedACL.toJSON().roles).toStrictEqual([
			{
				kind: 'role',
				permissions: ['read', 'update'],
				value: persistentRole.value,
			},
		])
	})

	it('reserves explicit ACL input for configured master execution', async () => {
		const explicit = new ACL().grantPublic('read')
		const operation = {
			input: { title: 'Explicit', acl: explicit },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: protectedPostNode,
		} as const

		await expect(
			resolveCreateOperationACL(
				operation,
				acl({ resolveInput: ({ inputAcl }) => inputAcl }).config,
				undefined,
				context,
			),
		).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
			internalDetails: { kind: 'acl-management-requires-master' },
		} satisfies Partial<FrameworkError>)

		await expect(
			resolveCreateOperationACL(
				operation,
				acl().config,
				undefined,
				masterContext,
			),
		).rejects.toThrow(
			new TypeError(
				'Explicit ACL input requires acl({ resolveInput }) configuration',
			),
		)

		const accepted = await resolveCreateOperationACL(
			operation,
			acl({ resolveInput: ({ inputAcl }) => inputAcl }).config,
			undefined,
			masterContext,
		)

		expect(accepted.input.acl).toBe(explicit)
	})

	it('applies entry limits to master create and update resolution', async () => {
		const Principal = Schema.define({
			className: 'ACLMasterLimitPrincipal',
			fields: {},
		})
		const oversized = new ACL()
			.grantPrincipal(Principal.pointer('first'), 'read')
			.grantPrincipal(Principal.pointer('second'), 'read')
		const config = acl({ resolveInput: ({ inputAcl }) => inputAcl }).config
		const limits = { maxPrincipals: 1, maxRoles: 50 }
		const createOperation = {
			input: { title: 'Explicit', acl: oversized },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: protectedPostNode,
		} as const

		await expect(
			resolveCreateOperationACL(
				createOperation,
				config,
				undefined,
				masterContext,
				false,
				limits,
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			internalDetails: { kind: 'acl-entry-limit' },
		} satisfies Partial<FrameworkError>)

		const updateOperation = {
			kind: 'update-one',
			query: new QueryBuilder(ProtectedPost).where({
				id: { eq: 'master-limit-post' },
			}).ast,
			update: {
				kind: 'update-expression',
				operations: [{ field: 'acl', kind: 'set', value: oversized }],
			},
		} as const
		await expect(
			resolvePreparedOperationACL(
				updateOperation,
				{ acl: new ACL() },
				config,
				undefined,
				masterContext,
				false,
				limits,
			),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	})

	it('resolves one master ACL replacement against the locked current value', async () => {
		const currentACL = new ACL().grantPublic('read')
		const proposedACL = new ACL().grantPublic('update')
		const resolvedACL = proposedACL.grantPublic('delete')
		const resolver = vi.fn(
			({ currentAcl, currentData, data, inputAcl, operation, update }) => {
				expect(operation).toBe('update')
				expect(currentAcl).toBe(currentACL)
				expect(inputAcl).toBe(proposedACL)
				expect(currentData).toStrictEqual({ title: 'Current' })
				expect(data).toStrictEqual({ title: 'Changed' })
				expect(update).toStrictEqual({
					kind: 'update-expression',
					operations: [{ field: 'title', kind: 'set', value: 'Changed' }],
				})

				return resolvedACL
			},
		)
		const operation = {
			kind: 'update-one',
			query: new QueryBuilder(ProtectedPost).where({
				id: { eq: '0198a43e-2431-7000-8000-000000000031' },
			}).ast,
			update: {
				kind: 'update-expression',
				operations: [
					{ field: 'title', kind: 'set', value: 'Changed' },
					{ field: 'acl', kind: 'set', value: proposedACL },
				],
			},
		} as const
		const target = {
			acl: currentACL,
			createdAt: '2026-08-04T00:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000031',
			title: 'Current',
			updatedAt: '2026-08-04T00:00:00.000Z',
		}

		const resolved = await resolvePreparedOperationACL(
			operation,
			target,
			acl({ resolveInput: resolver }).config,
			undefined,
			masterContext,
		)

		expect(resolved.update.operations[1]).toStrictEqual({
			field: 'acl',
			kind: 'set',
			value: resolvedACL,
		})
		expect(resolver).toHaveBeenCalledOnce()
		await expect(
			resolvePreparedOperationACL(
				operation,
				target,
				acl({ resolveInput: resolver }).config,
				undefined,
				context,
			),
		).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
			internalDetails: { kind: 'acl-management-requires-master' },
		} satisfies Partial<FrameworkError>)
	})

	it('routes itemized update ACL replacement through its prepared lifecycle', async () => {
		const adapter = new ACLRejectedWriteAdapter({
			acl: new ACL(),
			createdAt: '2026-08-04T00:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000031',
			title: 'Existing',
			updatedAt: '2026-08-04T00:00:00.000Z',
		})
		const databaseProvider = definePlugin({
			name: 'fixture.acl-replacement-write-database',
			slot: 'database-adapter',
			setup: ({ services }) => {
				services.provide(databaseAdapterServiceToken, adapter)
			},
		})
		const ultimabase = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'acl-replacement-master', value: 'unused-by-terminal' }],
				onUse: () => undefined,
			}),
			plugins: [aclPlugin(), databaseProvider],
			schemas: [ProtectedPost],
		})
		const replacement = new ACL().grantPublic('read')
		const masterOptions = { ultimabase, useMasterKey: true } as const

		try {
			await ultimabase.start()
			const updateTarget = '0198a43e-2431-7000-8000-000000000031'
			const attempts = [
				() =>
					ProtectedPost.updateMany(
						{
							data: [
								{
									where: { id: { eq: updateTarget } },
									data: { acl: replacement },
								},
							],
						},
						masterOptions,
					),
				() =>
					ProtectedPost.upsertOne(
						{
							where: (where) =>
								where.eq('id', '0198a43e-2431-7000-8000-000000000032'),
							create: { title: 'Created' },
							update: { acl: replacement },
						},
						masterOptions,
					),
				() =>
					ProtectedPost.upsertMany(
						{
							data: [
								{
									create: { title: 'Created' },
									where: (where) =>
										where.eq('id', '0198a43e-2431-7000-8000-000000000033'),
									update: { acl: replacement },
								},
							],
						},
						masterOptions,
					),
			] as const

			const expectedMessages = [
				'Explicit ACL input requires acl({ resolveInput }) configuration',
				'ACL replacement requires an itemized singular update.',
				'ACL replacement requires an itemized singular update.',
			] as const

			for (const [index, attempt] of attempts.entries()) {
				await expect(attempt()).rejects.toThrow(expectedMessages[index])
			}

			await expect(
				ProtectedPost.updateMany(
					{
						data: [
							{
								where: { id: { eq: updateTarget } },
								data: { acl: replacement },
							},
						],
					},
					{ ultimabase },
				),
			).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			} satisfies Partial<FrameworkError>)
			expect(adapter.transactions).toHaveLength(4)
			// A late fill passes generic field Access, then the prepared ACL policy rejects it securely.
			expect(
				adapter.transactions.map(({ prepareCount, rollbackCount }) => ({
					prepareCount,
					rollbackCount,
				})),
			).toStrictEqual([
				{ prepareCount: 1, rollbackCount: 1 },
				{ prepareCount: 0, rollbackCount: 1 },
				{ prepareCount: 0, rollbackCount: 1 },
				{ prepareCount: 1, rollbackCount: 1 },
			])
		} finally {
			await ultimabase.dispose()
		}
	})
})
