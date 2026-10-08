import { onTestFinished, describe, expect, it, vi } from 'vitest'
import type { FrameworkError } from '@ultimabase/core'
import {
	RequestSubjectReference,
	MasterAuthority,
	Pointer,
	QueryBuilder,
	plugin,
	contributeApplication,
	UltimaBase,
} from '@ultimabase/core'

import { ACL } from '../../src/acl.js'
import {
	normalizedACL,
	type ACLDefaultInput,
} from '../../src/acl-option.test-support.js'
import { aclPlugin, resolveCreateOperationACL } from '../../src/plugin.js'

import {
	databaseAdapterProvider,
	principalResolverProvider,
	roleResolverProvider,
	context,
	masterContext,
	ProtectedPost,
	protectedPostNode,
	ACLReadAdapter,
	ACLRejectedWriteAdapter,
	createRoleProviderFixture,
} from './plugin-fixtures.js'

const ACLSchemaApplication = UltimaBase.use(aclPlugin())

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

	it('requires the owning plugin only when a schema declares acl', async () => {
		await expect(
			new UltimaBase({ schemas: [ProtectedPost] }).initialize(),
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
		} satisfies Partial<FrameworkError>)

		const application = await new (UltimaBase.use(aclPlugin()))({
			schemas: [ProtectedPost],
		}).initialize()
		onTestFinished(() => application.dispose())

		const protectedSchema = application
			.compile()
			.schemas.get(ProtectedPost.className)
		expect(protectedSchema).toBe(ProtectedPost)
		expect(protectedSchema?.fields.acl?.kind).toBe('ultimabase.acl')
		expect(protectedSchema?.provenance.fields.acl?.owner).toMatchObject({
			kind: 'plugin',
			pluginId: '@ultimabase/acl-permissions-plugin',
		})
	})

	it('adds a private row filter, hides ACL output, and resolves the principal once', async () => {
		const Principal = UltimaBase.Schema.define({
			className: 'ACLPluginPrincipal',
			fields: () => ({}),
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
		const identityProvider = plugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.acl-principal-provider',
			contributions: [
				principalResolverProvider({
					resolveCurrent,
				}),
			],
		})
		const databaseProvider = plugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.acl-read-database',
			contributions: [databaseAdapterProvider(adapter)],
		})
		const ultimabase = new (UltimaBase.use(
			aclPlugin(),
			identityProvider,
			databaseProvider,
		))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'acl-test-master', value: 'unused-by-terminal' }],
				onUse: () => undefined,
			}),
			schemas: [Principal, ProtectedPost],
		})

		try {
			await ultimabase.start()
			const result = await ProtectedPost.findMany(undefined)
			expect(result[0]?.acl).toBeUndefined()
			const rowFilter = JSON.stringify(adapter.requests[0]?.rowFilter)
			expect(rowFilter).toContain('contains')
			expect(rowFilter).toContain(Principal.className)
			expect(rowFilter).toContain(currentPrincipal.id)
			expect(resolveCurrent).toHaveBeenCalledOnce()
			await expect(
				ProtectedPost.findMany({ select: { acl: true } }),
			).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
				publicMessage: 'The operation is not permitted.',
			} satisfies Partial<FrameworkError>)
			expect(adapter.requests).toHaveLength(1)
			const masterResult = await ProtectedPost.findMany(undefined, {
				useMasterKey: true,
			})
			expect(masterResult[0]?.acl).toBe(storedACL)
			expect(adapter.requests[1]?.rowFilter).toBeUndefined()
		} finally {
			await ultimabase.dispose()
		}
	})

	it('resolves optional role providers after setup in every configuration order', async () => {
		const fixtures = (
			[
				['after', 'after'],
				['before', 'before'],
			] as const
		).map(([suffix, placement]) => createRoleProviderFixture(suffix, placement))

		try {
			for (const { ultimabase } of fixtures) {
				await ultimabase.start()
				await ProtectedPost.findMany(undefined)
				await ultimabase.dispose()
			}

			for (const { adapter, role } of fixtures) {
				expect(JSON.stringify(adapter.requests[0]?.rowFilter)).toContain(
					role.value,
				)
			}
		} finally {
			await Promise.all(fixtures.map(({ ultimabase }) => ultimabase.dispose()))
		}
	})

	it('requires a provider during setup for statically declared role grants', async () => {
		const StaticRolePost = ACLSchemaApplication.Schema.define({
			className: 'ACLStaticRoleRequirementPost',
			fields: (field) => ({ title: field.string() }),
			acl: {
				default: new ACL().grantRole(
					new RequestSubjectReference('role', 'fixture-static-role'),
					'read',
				),
			},
		})
		let infrastructureStarted = false
		const infrastructure = plugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.acl-static-role-infrastructure',
			contributions: [
				contributeApplication(() => ({
					exports: undefined,
					connect: () => {
						infrastructureStarted = true
					},
				})),
			],
		})
		const ultimabase = new (UltimaBase.use(aclPlugin(), infrastructure))({
			schemas: [StaticRolePost],
		})

		await expect(ultimabase.start()).rejects.toMatchObject({
			code: 'PLUGIN_CAPABILITY_MISSING',
			internalDetails: {
				capabilityId: 'ultimabase.request-subject.role-resolver',
				kind: 'acl-role-resolver-required',
			},
		} satisfies Partial<FrameworkError>)
		expect(infrastructureStarted).toBe(false)

		const roleProvider = plugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.acl-static-role-provider',
			contributions: [
				roleResolverProvider({
					hasRole: () => false,
					resolveCurrentRoles: () => [],
					resolvePersistentRole: ({ role }) => role,
				}),
			],
		})
		const resolved = await new (UltimaBase.use(aclPlugin(), roleProvider))({
			schemas: [StaticRolePost],
		}).initialize()

		expect(resolved.state).toBe('ready')
		await resolved.dispose()
	})

	it('rejects dynamically produced role grants before adapter preparation', async () => {
		const dynamicRole = new RequestSubjectReference(
			'role',
			'fixture-dynamic-role',
		)
		const DynamicRolePost = ACLSchemaApplication.Schema.define({
			className: 'ACLDynamicRoleRequirementPost',
			fields: (field) => ({ title: field.string() }),
			acl: {
				default: () => new ACL().grantRole(dynamicRole, 'read'),
			},
		})
		const adapter = new ACLRejectedWriteAdapter()
		const databaseProvider = plugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.acl-dynamic-role-database',
			contributions: [databaseAdapterProvider(adapter)],
		})
		const ultimabase = new (UltimaBase.use(aclPlugin(), databaseProvider))({
			schemas: [DynamicRolePost],
		})

		try {
			await ultimabase.start()
			await expect(
				DynamicRolePost.createOne({ data: { title: 'Dynamic' } }),
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
		const defaultFactory = vi.fn(({ data }: ACLDefaultInput) => {
			expect(data).toStrictEqual({ title: 'Visible' })

			return generated
		})
		const config = normalizedACL({ default: defaultFactory })
		const operation = {
			input: { title: 'Visible' },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: protectedPostNode,
		} as const

		const resolved = await resolveCreateOperationACL(
			operation,
			config,
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
		const config = normalizedACL({ default: defaultFactory })
		const operation = {
			inputs: [{ title: 'First' }, { title: 'Second' }],
			kind: 'create-many',
			selection: new QueryBuilder(ProtectedPost).ast.selection,
			schema: protectedPostNode,
		} as const

		const resolved = await resolveCreateOperationACL(
			operation,
			config,
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
		const Principal = UltimaBase.Schema.define({
			className: 'ACLDefaultLimitPrincipal',
			fields: () => ({}),
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
				normalizedACL({ default: oversized }),
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
				normalizedACL({ default: () => Promise.resolve(oversized) }),
				undefined,
				context,
				false,
				limits,
			),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	})

	it('rolls back oversized batches and honors a wider schema override', async () => {
		const Principal = UltimaBase.Schema.define({
			className: 'ACLBatchLimitPrincipal',
			fields: () => ({}),
		})
		const twoPrincipals = new ACL()
			.grantPrincipal(Principal.pointer('first'), 'read')
			.grantPrincipal(Principal.pointer('second'), 'read')
		const BatchPost = ACLSchemaApplication.Schema.define({
			className: 'ACLBatchLimitPost',
			fields: (field) => ({
				title: field.string({ required: true }),
			}),
			acl: {
				default: ({ data }) => {
					const value = new ACL().grantPrincipal(
						Principal.pointer('first'),
						'read',
					)

					return data.title === 'Oversized'
						? value.grantPrincipal(Principal.pointer('second'), 'read')
						: value
				},
			},
		})
		const OverridePost = ACLSchemaApplication.Schema.define({
			className: 'ACLSchemaLimitOverridePost',
			fields: (field) => ({
				title: field.string({ required: true }),
			}),
			acl: {
				default: twoPrincipals,
				limits: { maxPrincipals: 2 },
			},
		})
		const adapter = new ACLRejectedWriteAdapter()
		const databaseProvider = plugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.acl-limit-write-database',
			contributions: [databaseAdapterProvider(adapter)],
		})
		const ultimabase = new (UltimaBase.use(
			aclPlugin({ limits: { maxPrincipals: 1 } }),
			databaseProvider,
		))({ schemas: [Principal, BatchPost, OverridePost] })

		try {
			await ultimabase.start()
			await expect(
				BatchPost.createMany({
					data: [{ title: 'Oversized' }, { title: 'Accepted' }],
				}),
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
				OverridePost.createOne({ data: { title: 'Schema override' } }),
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
		const persistentRole = new RequestSubjectReference(
			'role',
			'AppRole:0198a43e-2431-7000-8000-000000000040',
		)
		const roleAware = new ACL()
			.grantRole(new RequestSubjectReference('role', 'AppRole:editor'), 'read')
			.grantRole(
				new RequestSubjectReference('role', 'AppRole:authors'),
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
				normalizedACL({ default: roleAware }),
				undefined,
				context,
			),
		).rejects.toThrow(
			'ACL role grants require a role resolver with current-role enumeration',
		)
		await expect(
			resolveCreateOperationACL(
				operation,
				normalizedACL({ default: roleAware }),
				undefined,
				context,
				true,
			),
		).rejects.toThrow(
			'ACL role grants require a role resolver with persistent-role resolution',
		)
		const resolved = await resolveCreateOperationACL(
			operation,
			normalizedACL({ default: roleAware }),
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
				normalizedACL({ resolveInput: ({ inputAcl }) => inputAcl }),
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
				normalizedACL(),
				undefined,
				masterContext,
			),
		).rejects.toThrow(
			new TypeError(
				'Explicit ACL input requires an acl.resolveInput declaration',
			),
		)

		const accepted = await resolveCreateOperationACL(
			operation,
			normalizedACL({ resolveInput: ({ inputAcl }) => inputAcl }),
			undefined,
			masterContext,
		)

		expect(accepted.input.acl).toBe(explicit)
	})
})
