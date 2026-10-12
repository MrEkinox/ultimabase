import {
	ACL,
	aclPlugin,
	onACLChange,
	provideACLChangeObserver,
	type ACLChangedEvent,
	type aclChangedEvent,
} from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	Schema,
	UltimaBase,
	requestSubjectReferenceCleanupCapability,
	createRequestPrincipalReference,
	type RequestSubjectContext,
	type RequestSubjectReferenceCleanup,
	type NamedRequestSubjectReferenceCleanup,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	plugin,
	contributeApplication,
	optionalCapability,
	withPluginPrivileges,
} from '@ultimabase/core/plugin'
import {
	hooksPlugin,
	provideHookContributions,
	schemaHooks,
} from '@ultimabase/hooks-plugin'
import type { PluginEventHandlerInput } from '@ultimabase/plugin-kit'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

type ReferencePolicy = 'cascade' | 'fail' | 'preserve'
type ACLChangeHandlerInput = PluginEventHandlerInput<
	typeof aclChangedEvent,
	ACLChangedEvent
>

// PostgreSQL types the `postgres` table rules of `.with` (ADR-0320).
const ACLReferenceApplication = UltimaBase.use(postgresPlugin())
	.use(hooksPlugin())
	.use(aclPlugin())

const FailPrincipal = ACLReferenceApplication.Schema.define({
	className: 'ACLReferenceFailPrincipal',
	fields: (field) => ({
		name: field.string({ required: true }),
	}),
})
const PreservePrincipal = ACLReferenceApplication.Schema.define({
	className: 'ACLReferencePreservePrincipal',
	fields: (field) => ({
		name: field.string({ required: true }),
	}),
})
const CascadePrincipal = ACLReferenceApplication.Schema.define({
	className: 'ACLReferenceCascadePrincipal',
	fields: (field) => ({
		name: field.string({ required: true }),
	}),
})
const principalPolicies = immutableArray([
	immutableRecord({ policy: 'fail' as const, schema: FailPrincipal }),
	immutableRecord({ policy: 'preserve' as const, schema: PreservePrincipal }),
	immutableRecord({ policy: 'cascade' as const, schema: CascadePrincipal }),
])

const RoleApplication = UltimaBase.use(rolesPlugin())
const FailRole = RoleApplication.RoleSchema.define({
	className: 'ACLReferenceFailRole',
	members: () => FailPrincipal,
	deletion: 'fail',
}).with({})
const PreserveRole = RoleApplication.RoleSchema.define({
	className: 'ACLReferencePreserveRole',
	members: () => FailPrincipal,
	deletion: 'preserve',
}).with({})
const CascadeRole = RoleApplication.RoleSchema.define({
	className: 'ACLReferenceCascadeRole',
	members: () => FailPrincipal,
	deletion: 'cascade',
}).with({})

const emptyACL = new ACL()
const committedACLChanges: ACLChangedEvent[] = []
let rejectNextSecondaryCleanup = false
const ProtectedPrimary = ACLReferenceApplication.Schema.define({
	className: 'ACLReferenceProtectedPrimary',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})
	.acl()
	.with({
		postgres: { table: 'acl_reference_primary' },
		acl: {
			default: emptyACL,
		},
	})
const ProtectedSecondary = ACLReferenceApplication.Schema.define({
	className: 'ACLReferenceProtectedSecondary',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})
	.acl()
	.with({
		postgres: { table: 'acl_reference_secondary' },
		hooks: {
			beforeOperation: {
				update: () => {
					if (!rejectNextSecondaryCleanup) return

					rejectNextSecondaryCleanup = false
					throw new Error('ACL reference cleanup rollback fixture')
				},
			},
		},
		acl: {
			default: emptyACL,
		},
	})

const readPrincipalCleanups = (
	values: readonly NamedRequestSubjectReferenceCleanup[],
): readonly RequestSubjectReferenceCleanup<'principal'>[] =>
	immutableArray(
		values.flatMap(({ cleanup }) =>
			cleanup.kind === 'principal'
				? [cleanup as RequestSubjectReferenceCleanup<'principal'>]
				: [],
		),
	)

const optionalReferenceCleanups = optionalCapability(
	requestSubjectReferenceCleanupCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
const principalCleanupsBySchemas = new WeakMap<
	object,
	readonly RequestSubjectReferenceCleanup<'principal'>[]
>()

const applyPrincipalPolicy = async (
	context: RequestSubjectContext,
	schema: SchemaDefinition,
	id: string,
	policy: ReferencePolicy,
	cleanups: readonly RequestSubjectReferenceCleanup<'principal'>[],
): Promise<void> => {
	if (policy === 'preserve') return

	// Its schema creates every Pointer (ADR-0314).
	if (!Schema.is(schema)) throw new TypeError('Expected a principal schema')
	const reference = createRequestPrincipalReference(schema.pointer(id))

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
const principalOwnerPlugin = plugin({
	version: '0.0.0',
	core: '^0.0.0',
	peers: [
		{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' },
		{ pluginId: '@ultimabase/acl-permissions-plugin', version: '^0.0.0' },
	],
	id: 'fixture.acl-principal-owner',
	permissions: {
		'authority:elevate':
			'Executes ACL reference cleanup as trusted server-side work.',
		'runtime:intercept':
			'Enforces principal reference deletion policies in schema hooks.',
		'runtime:observe': 'Observes committed ACL changes for the E2E fixture.',
	},
	contributions: [
		provideACLChangeObserver(
			'fixture.observe:acl-change',
			onACLChange(({ event }: ACLChangeHandlerInput) => {
				committedACLChanges.push(event.payload)
			}),
		),
		withPluginPrivileges(
			provideHookContributions(
				'principal-reference-deletion',
				({ schemas }) => {
					const readCleanups = () =>
						principalCleanupsBySchemas.get(schemas) ?? []

					return principalPolicies.map(({ policy, schema }) =>
						schemaHooks(schema, {
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
						}),
					)
				},
			),
			['authority:elevate'],
		),
		optionalReferenceCleanups,
		contributeApplication(({ capabilities, schemas }) => {
			principalCleanupsBySchemas.set(
				schemas,
				readPrincipalCleanups(
					capabilities.get(optionalReferenceCleanups) ?? [],
				),
			)
			const exports = undefined
			return { exports }
		}),
	],
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
	new (UltimaBase.use(
		hooksPlugin(),
		principalOwnerPlugin,
		rolesPlugin(),
		aclPlugin(),
		postgresPlugin({ schemaPolicy, url: connectionUri }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-reference-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
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
): Promise<ACL> => {
	const input = { where: { id: { eq: id } }, select: { acl: true } } as const
	const options = { useMasterKey: true } as const
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
			const fail = await FailPrincipal.createOne(
				{ data: { name: 'fail' } },
				{ useMasterKey: true },
			)
			const preserve = await PreservePrincipal.createOne(
				{ data: { name: 'preserve' } },
				{ useMasterKey: true },
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
				{ useMasterKey: true },
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
				{ useMasterKey: true },
			)

			await expect(
				FailPrincipal.deleteOne(
					{ where: { id: { eq: fail.id } } },
					{ useMasterKey: true },
				),
			).rejects.toThrow('still has external references')
			await expect(
				PreservePrincipal.deleteOne(
					{ where: { id: { eq: preserve.id } } },
					{ useMasterKey: true },
				),
			).resolves.toMatchObject({ id: preserve.id })
			expect(
				(await readACL(ProtectedPrimary, failRow.id)).permissionsForPrincipal(
					FailPrincipal.pointer(fail.id),
				),
			).toStrictEqual(['read'])
			expect(
				(
					await readACL(ProtectedPrimary, preserveRow.id)
				).permissionsForPrincipal(PreservePrincipal.pointer(preserve.id)),
			).toStrictEqual(['read'])
		})

		it('rolls multi-schema principal cascade back before succeeding', async () => {
			const cascade = await CascadePrincipal.createOne(
				{ data: { name: 'cascade' } },
				{ useMasterKey: true },
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
				{ useMasterKey: true },
			)
			const secondary = await ProtectedSecondary.createOne(
				{ data: { acl: value, title: 'principal-cascade-secondary' } },
				{ useMasterKey: true },
			)

			await expect(
				CascadePrincipal.deleteOne({ where: { id: { eq: cascade.id } } }),
			).rejects.toThrow('Cascade principal deletion requires master authority')
			const changeStart = committedACLChanges.length
			rejectNextSecondaryCleanup = true
			await expect(
				CascadePrincipal.deleteOne(
					{ where: { id: { eq: cascade.id } } },
					{ useMasterKey: true },
				),
			).rejects.toThrow('ACL reference cleanup rollback fixture')
			expect(committedACLChanges).toHaveLength(changeStart)
			await expect(
				CascadePrincipal.exists({ where: { id: { eq: cascade.id } } }),
			).resolves.toBe(true)
			expect(
				(await readACL(ProtectedPrimary, primary.id)).permissionsForPrincipal(
					CascadePrincipal.pointer(cascade.id),
				),
			).toStrictEqual(['read', 'update'])
			expect(
				(
					await readACL(ProtectedSecondary, secondary.id)
				).permissionsForPrincipal(CascadePrincipal.pointer(cascade.id)),
			).toStrictEqual(['read', 'update'])

			await expect(
				CascadePrincipal.deleteOne(
					{ where: { id: { eq: cascade.id } } },
					{ useMasterKey: true },
				),
			).resolves.toMatchObject({ id: cascade.id })
			const cleanedPrimary = await readACL(ProtectedPrimary, primary.id)
			const cleanedSecondary = await readACL(ProtectedSecondary, secondary.id)

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
			const fail = await FailRole.createOne(
				{ data: { name: 'fail-role' } },
				{ useMasterKey: true },
			)
			const preserve = await PreserveRole.createOne(
				{ data: { name: 'preserve-role' } },
				{ useMasterKey: true },
			)
			const cascade = await CascadeRole.createOne(
				{ data: { name: 'cascade-role' } },
				{ useMasterKey: true },
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
				{ useMasterKey: true },
			)
			const preserveRow = await ProtectedPrimary.createOne(
				{
					data: {
						acl: new ACL().grantRole(preserveReference, 'read'),
						title: 'role-preserve',
					},
				},
				{ useMasterKey: true },
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
				{ useMasterKey: true },
			)

			await expect(
				FailRole.deleteOne(
					{ where: { id: { eq: fail.id } } },
					{ useMasterKey: true },
				),
			).rejects.toMatchObject({ code: 'ROLE_DELETE_REFERENCED' })
			await expect(
				PreserveRole.deleteOne(
					{ where: { id: { eq: preserve.id } } },
					{ useMasterKey: true },
				),
			).resolves.toMatchObject({ id: preserve.id })
			const changeStart = committedACLChanges.length
			await expect(
				CascadeRole.deleteOne(
					{ where: { id: { eq: cascade.id } } },
					{ useMasterKey: true },
				),
			).resolves.toMatchObject({ id: cascade.id })
			expect(
				(await readACL(ProtectedPrimary, failRow.id)).permissionsForRole(
					failReference,
				),
			).toStrictEqual(['read'])
			expect(
				(await readACL(ProtectedPrimary, preserveRow.id)).permissionsForRole(
					preserveReference,
				),
			).toStrictEqual(['read'])
			const cleaned = await readACL(ProtectedPrimary, cascadeRow.id)

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
			let first = getApplication()
			if (fixture === undefined)
				throw new TypeError('First database fixture is unavailable')
			const firstUri = fixture.connectionUri
			await using secondFixture = await createPostgresWorkerFixture({
				prefix: 'ultimabase_acl_reference_isolated',
			})
			let second = createApplication(secondFixture.connectionUri, 'override')

			try {
				const principal = await CascadePrincipal.createOne(
					{
						data: {
							name: 'isolated',
						},
					},
					{ useMasterKey: true },
				)
				const pointer = CascadePrincipal.pointer(principal.id)
				const firstRow = await ProtectedPrimary.createOne(
					{
						data: {
							acl: new ACL().grantPrincipal(pointer, 'read'),
							title: 'first-application',
						},
					},
					{ useMasterKey: true },
				)
				await first.dispose()
				await second.start()
				const secondRow = await ProtectedPrimary.createOne(
					{
						data: {
							acl: new ACL().grantPrincipal(pointer, 'read'),
							title: 'second-application',
						},
					},
					{ useMasterKey: true },
				)

				await second.dispose()
				first = createApplication(firstUri, 'ignore')
				await first.start()
				const freshPrincipal = await CascadePrincipal.findOneOrThrow(
					{ where: { id: principal.id } },
					{ useMasterKey: true },
				)
				await CascadePrincipal.deleteOne(
					{ where: { id: { eq: freshPrincipal.id } } },
					{ useMasterKey: true },
				)
				expect(
					(
						await readACL(ProtectedPrimary, firstRow.id)
					).permissionsForPrincipal(pointer),
				).toStrictEqual([])
				await first.dispose()
				second = createApplication(secondFixture.connectionUri, 'ignore')
				await second.start()
				expect(
					(
						await readACL(ProtectedPrimary, secondRow.id)
					).permissionsForPrincipal(pointer),
				).toStrictEqual(['read'])
			} finally {
				await first.dispose()
				await second.dispose()
			}
		})
	},
)
