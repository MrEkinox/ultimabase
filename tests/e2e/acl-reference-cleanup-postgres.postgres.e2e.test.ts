import { aclPostgresPlugin } from '@ultimabase/acl-postgres-plugin'
import {
	ACL,
	acl,
	aclPlugin,
	onACLChange,
	type ACLChangedEvent,
} from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	Pointer,
	Schema,
	UltimaBase,
	accessReferenceCleanupCapability,
	createAccessPrincipalReference,
	definePlugin,
	optionalCapability,
	type AccessContext,
	type AccessReferenceCleanup,
	type NamedAccessReferenceCleanup,
	type SchemaDefinition,
} from '@ultimabase/core'
import { postgresPlugin, postgresTable } from '@ultimabase/postgres-plugin'
import { RoleSchema, rolesPlugin } from '@ultimabase/roles-plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'
import { provideTestRuntimeObserver } from './runtime-capabilities.js'

type ReferencePolicy = 'cascade' | 'fail' | 'preserve'

const FailPrincipal = Schema.define({
	className: 'ACLReferenceFailPrincipal',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
	}),
})
const PreservePrincipal = Schema.define({
	className: 'ACLReferencePreservePrincipal',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
	}),
})
const CascadePrincipal = Schema.define({
	className: 'ACLReferenceCascadePrincipal',
	fields: (field) => ({
		name: field.string({ validation: { required: true } }),
	}),
})
const principalPolicies = immutableArray([
	immutableRecord({ policy: 'fail' as const, schema: FailPrincipal }),
	immutableRecord({ policy: 'preserve' as const, schema: PreservePrincipal }),
	immutableRecord({ policy: 'cascade' as const, schema: CascadePrincipal }),
])

const FailRole = RoleSchema.define({
	className: 'ACLReferenceFailRole',
	members: { schema: FailPrincipal },
	deletion: { references: 'fail' },
	fields: () => ({}),
})
const PreserveRole = RoleSchema.define({
	className: 'ACLReferencePreserveRole',
	members: { schema: FailPrincipal },
	deletion: { references: 'preserve' },
	fields: () => ({}),
})
const CascadeRole = RoleSchema.define({
	className: 'ACLReferenceCascadeRole',
	members: { schema: FailPrincipal },
	deletion: { references: 'cascade' },
	fields: () => ({}),
})

const emptyACL = new ACL()
const committedACLChanges: ACLChangedEvent[] = []
let rejectNextSecondaryCleanup = false
const ProtectedPrimary = Schema.define({
	className: 'ACLReferenceProtectedPrimary',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
	extensions: [
		acl({
			default: emptyACL,
			resolveInput: ({ currentAcl, inputAcl }) =>
				inputAcl ?? currentAcl ?? emptyACL,
		}),
		postgresTable({ name: 'acl_reference_primary' }),
	],
})
const ProtectedSecondary = Schema.define({
	className: 'ACLReferenceProtectedSecondary',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
	extensions: [
		acl({
			default: emptyACL,
			resolveInput: ({ currentAcl, inputAcl }) =>
				inputAcl ?? currentAcl ?? emptyACL,
		}),
		postgresTable({ name: 'acl_reference_secondary' }),
	],
	hooks: {
		beforeOperation: {
			update: ({ operation }) => {
				if (!rejectNextSecondaryCleanup) return

				rejectNextSecondaryCleanup = false
				void operation
				throw new Error('ACL reference cleanup rollback fixture')
			},
		},
	},
})

const readPrincipalCleanups = (
	values: readonly NamedAccessReferenceCleanup[],
): readonly AccessReferenceCleanup<'principal'>[] =>
	immutableArray(
		values.flatMap(({ cleanup }) =>
			cleanup.kind === 'principal'
				? [cleanup as AccessReferenceCleanup<'principal'>]
				: [],
		),
	)

const optionalReferenceCleanups = optionalCapability(
	accessReferenceCleanupCapability,
	'^1.0.0',
)

const applyPrincipalPolicy = async (
	context: AccessContext,
	schema: SchemaDefinition,
	id: string,
	policy: ReferencePolicy,
	cleanups: readonly AccessReferenceCleanup<'principal'>[],
): Promise<void> => {
	if (policy === 'preserve') return

	const reference = createAccessPrincipalReference(new Pointer(schema, id))

	if (policy === 'fail') {
		for (const cleanup of cleanups) {
			if (await cleanup.hasReferences({ context, reference })) {
				throw new Error(`Principal ${id} still has external references`)
			}
		}

		return
	}

	if (context.access.mode !== 'master') {
		throw new Error('Cascade principal deletion requires master authority')
	}

	for (const cleanup of cleanups) {
		await cleanup.cleanup({ context, reference })
	}
}

/** Emulates a future auth provider while owning principal deletion policy. */
const principalOwnerPlugin = definePlugin({
	version: '0.0.0',
	core: '^0.0.0',
	pluginId: 'fixture.acl-principal-owner',
	privileges: [
		{
			name: 'runtime:intercept',
			reason: 'Enforces principal reference deletion policies in schema hooks.',
		},
		{
			name: 'runtime:observe',
			reason: 'Observes committed ACL changes for the E2E fixture.',
		},
	],
	capabilities: {
		optional: [optionalReferenceCleanups],
		provides: [
			provideTestRuntimeObserver(
				'fixture.observe:acl-change',
				onACLChange(({ event }) => {
					committedACLChanges.push(event.payload)
				}),
			),
		],
	},
	setup: ({ capabilities, hooks }) => {
		const readCleanups = () =>
			readPrincipalCleanups(capabilities.get(optionalReferenceCleanups) ?? [])

		for (const { policy, schema } of principalPolicies) {
			hooks.schema(`principal-delete:${schema.className}`, schema, {
				beforeOperation: {
					delete: async (input) => {
						await applyPrincipalPolicy(
							input.context,
							schema,
							input.originalItem.id,
							policy,
							readCleanups(),
						)
					},
				},
			})
		}
	},
})

const schemas = immutableArray([
	FailPrincipal,
	PreservePrincipal,
	CascadePrincipal,
	FailRole,
	PreserveRole,
	CascadeRole,
	ProtectedPrimary,
	ProtectedSecondary,
])

const createApplication = (
	connectionUri: string,
	schemaPolicy: 'ignore' | 'override',
) =>
	new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-reference-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		plugins: [
			principalOwnerPlugin,
			rolesPlugin(),
			aclPlugin(),
			postgresPlugin({ schemaPolicy, url: connectionUri }),
			aclPostgresPlugin(),
		],
		schemas,
	})

type ACLReferenceApplication = ReturnType<typeof createApplication>

let fixture: PostgresWorkerFixture | undefined
let application: ACLReferenceApplication | undefined

const getApplication = (): ACLReferenceApplication => {
	if (application === undefined) {
		throw new TypeError('ACL reference application has not started')
	}

	return application
}

const readACL = async (
	schema: typeof ProtectedPrimary | typeof ProtectedSecondary,
	id: string,
	ultimabase: ACLReferenceApplication,
): Promise<ACL> => {
	const input = { where: { id: { eq: id } }, select: { acl: true } } as const
	const options = { ultimabase, useMasterKey: true } as const
	const row =
		schema === ProtectedPrimary
			? await ProtectedPrimary.findOne(input, options)
			: await ProtectedSecondary.findOne(input, options)
	const value: unknown = row === null ? undefined : Reflect.get(row, 'acl')

	if (!(value instanceof ACL)) {
		throw new TypeError('ACL reference fixture row is missing its ACL')
	}

	return value
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	application = createApplication(fixture.connectionUri, 'override')
	await application.start()
}, 30_000)

afterAll(async () => {
	await application?.dispose()
	await fixture?.dispose()
})

describe(
	'ACL subject-reference cleanup with PostgreSQL',
	{ concurrent: false },
	() => {
		it('lets principal owners enforce fail and preserve policies', async () => {
			const ultimabase = getApplication()
			const fail = await new FailPrincipal({ name: 'fail' }).create(
				{},
				{ ultimabase, useMasterKey: true },
			)
			const preserve = await new PreservePrincipal({ name: 'preserve' }).create(
				{},
				{ ultimabase, useMasterKey: true },
			)
			const failRow = await ProtectedPrimary.createOne(
				{
					data: {
						acl: new ACL().grantPrincipal(
							FailPrincipal.pointer(fail.id),
							'read',
						),
						title: 'principal-fail',
					},
				},
				{ ultimabase, useMasterKey: true },
			)
			const preserveRow = await ProtectedPrimary.createOne(
				{
					data: {
						acl: new ACL().grantPrincipal(
							PreservePrincipal.pointer(preserve.id),
							'read',
						),
						title: 'principal-preserve',
					},
				},
				{ ultimabase, useMasterKey: true },
			)

			await expect(
				fail.delete({}, { ultimabase, useMasterKey: true }),
			).rejects.toThrow('still has external references')
			await expect(
				preserve.delete({}, { ultimabase, useMasterKey: true }),
			).resolves.toMatchObject({ id: preserve.id })
			expect(
				(
					await readACL(ProtectedPrimary, failRow.id, ultimabase)
				).permissionsForPrincipal(FailPrincipal.pointer(fail.id)),
			).toStrictEqual(['read'])
			expect(
				(
					await readACL(ProtectedPrimary, preserveRow.id, ultimabase)
				).permissionsForPrincipal(PreservePrincipal.pointer(preserve.id)),
			).toStrictEqual(['read'])
		})

		it('rolls multi-schema principal cascade back before succeeding', async () => {
			const ultimabase = getApplication()
			const cascade = await new CascadePrincipal({ name: 'cascade' }).create(
				{},
				{ ultimabase, useMasterKey: true },
			)
			const unrelated = FailPrincipal.pointer(
				'0198a43e-2431-7000-8000-000000000090',
			)
			const value = new ACL()
				.grantPublic('read')
				.grantPrincipal(CascadePrincipal.pointer(cascade.id), 'read', 'update')
				.grantPrincipal(unrelated, 'delete')
			const primary = await ProtectedPrimary.createOne(
				{ data: { acl: value, title: 'principal-cascade-primary' } },
				{ ultimabase, useMasterKey: true },
			)
			const secondary = await ProtectedSecondary.createOne(
				{ data: { acl: value, title: 'principal-cascade-secondary' } },
				{ ultimabase, useMasterKey: true },
			)

			await expect(cascade.delete({}, { ultimabase })).rejects.toThrow(
				'Cascade principal deletion requires master authority',
			)
			const changeStart = committedACLChanges.length
			rejectNextSecondaryCleanup = true
			await expect(
				cascade.delete({}, { ultimabase, useMasterKey: true }),
			).rejects.toThrow('ACL reference cleanup rollback fixture')
			expect(committedACLChanges).toHaveLength(changeStart)
			await expect(
				CascadePrincipal.exists(
					{ where: { id: { eq: cascade.id } } },
					{ ultimabase },
				),
			).resolves.toBe(true)
			expect(
				(
					await readACL(ProtectedPrimary, primary.id, ultimabase)
				).permissionsForPrincipal(CascadePrincipal.pointer(cascade.id)),
			).toStrictEqual(['read', 'update'])
			expect(
				(
					await readACL(ProtectedSecondary, secondary.id, ultimabase)
				).permissionsForPrincipal(CascadePrincipal.pointer(cascade.id)),
			).toStrictEqual(['read', 'update'])

			await expect(
				cascade.delete({}, { ultimabase, useMasterKey: true }),
			).resolves.toMatchObject({ id: cascade.id })
			const cleanedPrimary = await readACL(
				ProtectedPrimary,
				primary.id,
				ultimabase,
			)
			const cleanedSecondary = await readACL(
				ProtectedSecondary,
				secondary.id,
				ultimabase,
			)

			expect(
				cleanedPrimary.permissionsForPrincipal(
					CascadePrincipal.pointer(cascade.id),
				),
			).toStrictEqual([])
			expect(
				cleanedSecondary.permissionsForPrincipal(
					CascadePrincipal.pointer(cascade.id),
				),
			).toStrictEqual([])
			expect(cleanedPrimary.permissionsForPrincipal(unrelated)).toStrictEqual([
				'delete',
			])
			expect(cleanedPrimary.permissionsForPublic()).toStrictEqual(['read'])
			expect(
				committedACLChanges
					.slice(changeStart)
					.map(({ diff, operation, target }) => ({ diff, operation, target })),
			).toStrictEqual([
				{
					diff: {
						added: [],
						removed: [
							{
								permissions: ['read', 'update'],
								subject: {
									className: CascadePrincipal.className,
									id: cascade.id,
									kind: 'principal',
								},
							},
						],
					},
					operation: 'update',
					target: { className: ProtectedPrimary.className, id: primary.id },
				},
				{
					diff: {
						added: [],
						removed: [
							{
								permissions: ['read', 'update'],
								subject: {
									className: CascadePrincipal.className,
									id: cascade.id,
									kind: 'principal',
								},
							},
						],
					},
					operation: 'update',
					target: {
						className: ProtectedSecondary.className,
						id: secondary.id,
					},
				},
			])
		})

		it('lets RoleSchema own fail, preserve, and cascade behavior', async () => {
			const ultimabase = getApplication()
			const fail = await new FailRole({ name: 'fail-role' }).create(
				{},
				{ ultimabase, useMasterKey: true },
			)
			const preserve = await new PreserveRole({ name: 'preserve-role' }).create(
				{},
				{ ultimabase, useMasterKey: true },
			)
			const cascade = await new CascadeRole({ name: 'cascade-role' }).create(
				{},
				{ ultimabase, useMasterKey: true },
			)
			const failReference = FailRole.role({ id: fail.id })
			const preserveReference = PreserveRole.role({
				id: preserve.id,
			})
			const cascadeReference = CascadeRole.role({
				id: cascade.id,
			})
			const failRow = await ProtectedPrimary.createOne(
				{
					data: {
						acl: new ACL().grantRole(failReference, 'read'),
						title: 'role-fail',
					},
				},
				{ ultimabase, useMasterKey: true },
			)
			const preserveRow = await ProtectedPrimary.createOne(
				{
					data: {
						acl: new ACL().grantRole(preserveReference, 'read'),
						title: 'role-preserve',
					},
				},
				{ ultimabase, useMasterKey: true },
			)
			const cascadeRow = await ProtectedPrimary.createOne(
				{
					data: {
						acl: new ACL()
							.grantPublic('read')
							.grantRole(cascadeReference, 'read', 'delete')
							.grantRole(failReference, 'update'),
						title: 'role-cascade',
					},
				},
				{ ultimabase, useMasterKey: true },
			)

			await expect(
				fail.delete({}, { ultimabase, useMasterKey: true }),
			).rejects.toMatchObject({ code: 'ROLE_DELETE_REFERENCED' })
			await expect(
				preserve.delete({}, { ultimabase, useMasterKey: true }),
			).resolves.toMatchObject({ id: preserve.id })
			const changeStart = committedACLChanges.length
			await expect(
				cascade.delete({}, { ultimabase, useMasterKey: true }),
			).resolves.toMatchObject({ id: cascade.id })
			expect(
				(
					await readACL(ProtectedPrimary, failRow.id, ultimabase)
				).permissionsForRole(failReference),
			).toStrictEqual(['read'])
			expect(
				(
					await readACL(ProtectedPrimary, preserveRow.id, ultimabase)
				).permissionsForRole(preserveReference),
			).toStrictEqual(['read'])
			const cleaned = await readACL(ProtectedPrimary, cascadeRow.id, ultimabase)

			expect(cleaned.permissionsForRole(cascadeReference)).toStrictEqual([])
			expect(cleaned.permissionsForRole(failReference)).toStrictEqual([
				'update',
			])
			expect(cleaned.permissionsForPublic()).toStrictEqual(['read'])
			expect(committedACLChanges.slice(changeStart)).toMatchObject([
				{
					diff: {
						added: [],
						removed: [
							{
								permissions: ['read', 'delete'],
								subject: {
									kind: 'role',
									value: cascadeReference.value,
								},
							},
						],
					},
					operation: 'update',
					target: { className: ProtectedPrimary.className, id: cascadeRow.id },
				},
			])
		})

		it('keeps cleanup contributions isolated between applications', async () => {
			const first = getApplication()
			const secondFixture = await createPostgresWorkerFixture({
				prefix: 'ultimabase_acl_reference_isolated',
			})
			const second = createApplication(secondFixture.connectionUri, 'override')

			await second.start()

			try {
				const principal = await new CascadePrincipal({
					name: 'isolated',
				}).create({}, { ultimabase: first, useMasterKey: true })
				const pointer = CascadePrincipal.pointer(principal.id)
				const firstRow = await ProtectedPrimary.createOne(
					{
						data: {
							acl: new ACL().grantPrincipal(pointer, 'read'),
							title: 'first-application',
						},
					},
					{ ultimabase: first, useMasterKey: true },
				)
				const secondRow = await ProtectedPrimary.createOne(
					{
						data: {
							acl: new ACL().grantPrincipal(pointer, 'read'),
							title: 'second-application',
						},
					},
					{ ultimabase: second, useMasterKey: true },
				)

				await principal.delete({}, { ultimabase: first, useMasterKey: true })
				expect(
					(
						await readACL(ProtectedPrimary, firstRow.id, first)
					).permissionsForPrincipal(pointer),
				).toStrictEqual([])
				expect(
					(
						await readACL(ProtectedPrimary, secondRow.id, second)
					).permissionsForPrincipal(pointer),
				).toStrictEqual(['read'])
			} finally {
				await second.dispose()
				await secondFixture.dispose()
			}
		})
	},
)
