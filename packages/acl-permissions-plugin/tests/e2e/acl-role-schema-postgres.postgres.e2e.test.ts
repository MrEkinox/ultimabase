import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	RequestContext,
	RequestContextValue,
	UltimaBase,
	plugin,
	requestSources,
	type PluginSourceState,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { RoleSchema, rolesPlugin } from '@ultimabase/roles-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import { provideTestPrincipalResolver } from '../../../../tests/fixtures/access-capability-fixtures.js'
import { requireACLValue } from './acl-test-fixtures.js'

const currentMemberId = new RequestContextValue<string>(
	'fixture.acl-role-schema.member-id',
	(value: unknown): string => {
		if (typeof value !== 'string' || value.length === 0) {
			throw new TypeError('ACL RoleSchema member id must be a string')
		}

		return value
	},
)
const ACLRoleSchemaApplication = UltimaBase.use(rolesPlugin()).use(aclPlugin())
const Member = ACLRoleSchemaApplication.Schema.define({
	className: 'ACLRoleSchemaMember',
	fields: (field) => ({
		email: field.string({ required: true }),
	}),
	postgres: { table: 'acl_role_schema_members' },
})
const identityPlugin = plugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'fixture.acl-role-schema.identity',
	contributions: [
		provideTestPrincipalResolver({
			resolveCurrent: ({ context }) => {
				const id = context.getValue(currentMemberId)

				return id === undefined ? undefined : Member.pointer(id)
			},
		}),
	],
})
const emptyACL = new ACL()
const AppRole = RoleSchema.define(ACLRoleSchemaApplication.Schema, {
	className: 'ACLProtectedAppRole',
	deletion: { references: 'fail' },
	fields: (field) => ({ description: field.string() }),
	members: {
		resolveCurrent: ({ context }) => {
			const id = context.getValue(currentMemberId)

			return id === undefined ? undefined : Member.pointer(id)
		},
		schema: Member,
	},
	acl: {
		default: emptyACL,
		resolveInput: ({ currentAcl, inputAcl }) =>
			inputAcl ?? currentAcl ?? emptyACL,
	},
	postgres: { table: 'acl_protected_app_roles' },
})

type PersistedMember = Awaited<
	ReturnType<InstanceType<typeof Member>['create']>
>
type PersistedRole = Awaited<ReturnType<InstanceType<typeof AppRole>['create']>>

let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [typeof Member, typeof AppRole],
			readonly [
				typeof identityPlugin,
				ReturnType<typeof aclPlugin>,
				ReturnType<typeof rolesPlugin>,
				ReturnType<typeof postgresPlugin>,
			],
			PluginSourceState
	  >
	| undefined
let alice: PersistedMember | undefined
let bob: PersistedMember | undefined
let editor: PersistedRole | undefined
let roleProtected: PersistedRole | undefined
let parent: PersistedRole | undefined
let child: PersistedRole | undefined
let deletable: PersistedRole | undefined

const requireFixture = <TValue>(
	value: TValue | undefined,
	label: string,
): TValue => {
	if (value === undefined) {
		throw new TypeError(`Missing ACL RoleSchema fixture: ${label}`)
	}

	return value
}

const aliceRequest = (requestId: string): RequestContext =>
	RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
	}).withValue(currentMemberId, requireFixture(alice, 'alice').id)

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new (UltimaBase.use(
		hooksPlugin(),
		identityPlugin,
		aclPlugin(),
		rolesPlugin(),
		postgresPlugin({
			schemaPolicy: 'override',
			url: fixture.connectionUri,
		}),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-role-schema-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		schemas: [Member, AppRole],
	})
	await ultimabase.start()

	;[alice, bob] = await Member.createMany(
		{ data: [{ email: 'alice@example.test' }, { email: 'bob@example.test' }] },
		{ useMasterKey: true },
	)
	const alicePointer = Member.pointer(requireFixture(alice, 'alice').id)
	const aliceRead = new ACL().grantPrincipal(alicePointer, 'read')
	const aliceUpdate = aliceRead.grantPrincipal(alicePointer, 'update')

	editor = await AppRole.createOne(
		{
			data: {
				acl: aliceUpdate,
				description: 'Directly managed by Alice',
				name: 'editor',
			},
		},
		{ useMasterKey: true },
	)
	await editor.addMember(alicePointer, { useMasterKey: true })

	roleProtected = await AppRole.createOne(
		{
			data: {
				acl: new ACL().grantRole(
					AppRole.role({ id: editor.id }),
					'read',
					'update',
				),
				description: 'Resolved through the protected role graph',
				name: 'role-protected',
			},
		},
		{ useMasterKey: true },
	)
	parent = await AppRole.createOne(
		{
			data: { acl: aliceUpdate, description: 'Nested parent', name: 'parent' },
		},
		{ useMasterKey: true },
	)
	child = await AppRole.createOne(
		{ data: { acl: aliceRead, description: 'Nested child', name: 'child' } },
		{ useMasterKey: true },
	)
	deletable = await AppRole.createOne(
		{
			data: {
				acl: aliceRead.grantPrincipal(alicePointer, 'delete'),
				description: 'Deletable by Alice',
				name: 'deletable',
			},
		},
		{ useMasterKey: true },
	)
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe(
	'ACL-protected RoleSchema with PostgreSQL',
	{ concurrent: false },
	() => {
		it('resolves role ACLs without recursively authorizing provider queries', async () => {
			const context = aliceRequest('acl-role-schema-resolution')
			const current = requireFixture(roleProtected, 'role-protected')
			const resolved = await AppRole.findOne(
				{
					where: { id: { eq: current.id } },
					select: { description: true, name: true },
				},
				{ context },
			)

			expect(resolved?.name).toBe('role-protected')
			const persistedACL = await AppRole.findOne(
				{ where: { id: { eq: current.id } }, select: { acl: true } },
				{ useMasterKey: true },
			)
			const aclValue = requireACLValue(
				persistedACL?.acl,
				'Expected the persisted role ACL to be materialized',
			)

			expect(
				aclValue.permissionsForRole(
					AppRole.role({
						id: requireFixture(editor, 'editor').id,
					}),
				),
			).toStrictEqual(['read', 'update'])
			await expect(
				current.update(
					{ data: { description: 'Updated through role ACL' } },
					{ context },
				),
			).resolves.toMatchObject({ description: 'Updated through role ACL' })
		})

		it('applies ordinary update ACLs to member and nested-role commands', async () => {
			const context = aliceRequest('acl-role-schema-commands')
			const currentEditor = requireFixture(editor, 'editor')
			const currentParent = requireFixture(parent, 'parent')
			const currentChild = requireFixture(child, 'child')

			await expect(
				currentEditor.addMember(requireFixture(bob, 'bob'), {
					context,
				}),
			).resolves.toBeUndefined()
			await expect(
				currentParent.addRole(currentChild, { context }),
			).resolves.toBeUndefined()
			await expect(currentEditor.relation('members').count({})).resolves.toBe(2)
			await expect(
				currentParent.relation('roles').count({}, { context }),
			).resolves.toBe(1)
		})

		it('keeps ACL replacement master-only while honoring delete rights', async () => {
			const context = aliceRequest('acl-role-schema-management')
			const currentEditor = requireFixture(editor, 'editor')

			await expect(
				currentEditor.update(
					{ data: { acl: new ACL().grantPublic('read') } },
					{ context },
				),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
			await expect(
				requireFixture(deletable, 'deletable').delete({}, { context }),
			).resolves.toMatchObject({ name: 'deletable' })
			await expect(
				AppRole.findMany({ select: { acl: true } }, { context }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		})
	},
)
