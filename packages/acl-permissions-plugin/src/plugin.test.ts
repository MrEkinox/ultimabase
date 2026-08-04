import type { FrameworkError } from '@ultimabase/core'
import {
	AccessSubjectReference,
	MasterAuthority,
	Pointer,
	Schema,
	accessPrincipalResolverServiceToken,
	createApplication,
	databaseAdapterServiceToken,
	definePlugin,
	stringField,
	UltimaBase,
	type DatabaseAdapter,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type HookContext,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import { ACL } from './acl.js'
import { acl, type ACLDefaultInput } from './acl-extension.js'
import {
	aclPlugin,
	assertSingularACLReplacement,
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
const protectedPostNode = ProtectedPost.query().ast.schema

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

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request

		return Promise.reject(
			new TypeError('ACL limit fixture only accepts automatic transactions'),
		)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		const transaction = new ACLRejectedWriteTransaction()
		this.transactions.push(transaction)

		return Promise.resolve(transaction)
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
			const result = await ProtectedPost.query().find({ ultimabase })

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
				ProtectedPost.query().select('acl').find({ ultimabase }),
			).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
				internalDetails: {
					fieldPath: ['acl'],
					phase: 'access-field-read',
				},
			} satisfies Partial<FrameworkError>)
			expect(adapter.requests).toHaveLength(1)
			const masterResult = await ProtectedPost.query().find({
				ultimabase,
				useMasterKey: true,
			})
			expect(masterResult[0]?.acl).toBe(storedACL)
			expect(adapter.requests[1]?.constraints).toStrictEqual([])
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
			options: { atomic: true },
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
				BatchPost.query().createMany(
					[{ title: 'Accepted' }, { title: 'Oversized' }],
					{ ultimabase },
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
				OverridePost.query().create(
					{ title: 'Schema override' },
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
			query: ProtectedPost.query().byId('master-limit-post').ast,
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
		const resolver = vi.fn(({ currentAcl, data, inputAcl, operation }) => {
			expect(operation).toBe('update')
			expect(currentAcl).toBe(currentACL)
			expect(inputAcl).toBe(proposedACL)
			expect(data).toStrictEqual({ title: 'Changed' })

			return resolvedACL
		})
		const operation = {
			kind: 'update-one',
			query: ProtectedPost.query().byId('0198a43e-2431-7000-8000-000000000031')
				.ast,
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

	it('rejects set-based ACL replacement without materializing rows', () => {
		const update = {
			kind: 'update-expression',
			operations: [{ field: 'acl', kind: 'set', value: new ACL() }],
		} as const

		expect(() => {
			assertSingularACLReplacement({
				kind: 'update-many',
				query: ProtectedPost.query().ast,
				update,
			})
		}).toThrow('ACL replacement requires an itemized singular update.')
		expect(() => {
			assertSingularACLReplacement({
				kind: 'update-one',
				query: ProtectedPost.query().ast,
				update,
			})
		}).not.toThrow()
	})
})
