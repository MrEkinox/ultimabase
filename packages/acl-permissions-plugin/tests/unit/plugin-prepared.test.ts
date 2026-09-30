import type { FrameworkError } from '@ultimabase/core'
import {
	MasterAuthority,
	QueryBuilder,
	Schema,
	plugin,
	UltimaBase,
} from '@ultimabase/core'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ACL } from '../../src/acl.js'
import { normalizedACL } from '../../src/acl-option.test-support.js'
import {
	aclPlugin,
	resolveCreateOperationACL,
	resolvePreparedOperationACL,
} from '../../src/plugin.js'

import {
	context,
	databaseAdapterProvider,
	masterContext,
	ProtectedPost,
	protectedPostNode,
	ACLRejectedWriteAdapter,
} from './plugin-fixtures.js'

describe('aclPlugin prepared input resolution', () => {
	beforeAll(async () => {
		// A standalone suite must compile the ACL-owned field before row-aware updates.
		const application = await new (UltimaBase.use(aclPlugin()))({
			schemas: [ProtectedPost],
		}).initialize()
		await application.dispose()
	})

	it('applies entry limits to master create and update resolution', async () => {
		const Principal = Schema.define({
			className: 'ACLMasterLimitPrincipal',
			fields: () => ({}),
		})
		const oversized = new ACL()
			.grantPrincipal(Principal.pointer('first'), 'read')
			.grantPrincipal(Principal.pointer('second'), 'read')
		const config = normalizedACL({ resolveInput: ({ inputAcl }) => inputAcl })
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
			normalizedACL({ resolveInput: resolver }),
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
				normalizedACL({ resolveInput: resolver }),
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
		const databaseProvider = plugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.acl-replacement-write-database',
			contributions: [databaseAdapterProvider(adapter)],
		})
		const ultimabase = new (UltimaBase.use(aclPlugin(), databaseProvider))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'acl-replacement-master', value: 'unused-by-terminal' }],
				onUse: () => undefined,
			}),
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
							where: {
								id: { eq: '0198a43e-2431-7000-8000-000000000032' },
							},
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
									where: {
										id: { eq: '0198a43e-2431-7000-8000-000000000033' },
									},
									update: { acl: replacement },
								},
							],
						},
						masterOptions,
					),
			] as const

			const expectedMessages = [
				'Explicit ACL input requires an acl.resolveInput declaration',
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
