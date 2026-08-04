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
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type HookContext,
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

describe('aclPlugin create input resolution', () => {
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

	it('requires current-role enumeration before accepting role-aware values', async () => {
		const roleAware = new ACL().grantRole(
			new AccessSubjectReference('role', 'AppRole:editor'),
			'read',
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
		).resolves.toMatchObject({ input: { acl: roleAware } })
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
