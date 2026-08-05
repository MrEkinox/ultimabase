import { aclPostgresPlugin } from '@ultimabase/acl-postgres-plugin'
import { ACL, acl, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	RequestContext,
	RequestContextValue,
	Schema,
	UltimaBase,
	accessPrincipalResolverServiceToken,
	definePlugin,
	requestSources,
	stringField,
} from '@ultimabase/core'
import { postgresPlugin, postgresTable } from '@ultimabase/postgres-plugin'
import { RoleSchema, rolesPlugin } from '@ultimabase/roles-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const currentMemberId = new RequestContextValue<string>(
	'fixture.acl-role-schema.member-id',
	(value: unknown): string => {
		if (typeof value !== 'string' || value.length === 0) {
			throw new TypeError('ACL RoleSchema member id must be a string')
		}

		return value
	},
)
const Member = Schema.define({
	className: 'ACLRoleSchemaMember',
	fields: { email: stringField({ validation: { required: true } }) },
	extensions: [postgresTable({ name: 'acl_role_schema_members' })],
})
const identityPlugin = definePlugin({
	name: 'fixture.acl-role-schema.identity',
	setup: ({ services }) => {
		services.provide(accessPrincipalResolverServiceToken, {
			resolveCurrent: ({ context }) => {
				const id = context.getValue(currentMemberId)

				return id === undefined ? undefined : Member.pointer(id)
			},
		})
	},
})
const emptyACL = new ACL()
const AppRole = RoleSchema.define({
	className: 'ACLProtectedAppRole',
	deletion: { references: 'fail' },
	fields: { description: stringField() },
	members: {
		resolveCurrent: ({ context }) => {
			const id = context.getValue(currentMemberId)

			return id === undefined ? undefined : Member.pointer(id)
		},
		schema: Member,
	},
	extensions: [
		acl({
			default: emptyACL,
			resolveInput: ({ currentAcl, inputAcl }) =>
				inputAcl ?? currentAcl ?? emptyACL,
		}),
		postgresTable({ name: 'acl_protected_app_roles' }),
	],
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
				ReturnType<typeof aclPostgresPlugin>,
			]
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

const getApplication = (): NonNullable<typeof ultimabase> =>
	requireFixture(ultimabase, 'application')

const aliceRequest = (requestId: string): RequestContext =>
	RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
	}).withValue(currentMemberId, requireFixture(alice, 'alice').id)

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-role-schema-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		plugins: [
			identityPlugin,
			aclPlugin(),
			rolesPlugin(),
			postgresPlugin({
				schemaPolicy: 'override',
				url: fixture.connectionUri,
			}),
			aclPostgresPlugin(),
		],
		schemas: [Member, AppRole],
	})
	await ultimabase.start()
	const app = getApplication()

	;[alice, bob] = await Member.createMany(
		[{ email: 'alice@example.test' }, { email: 'bob@example.test' }],
		{ ultimabase: app, useMasterKey: true },
	)
	const alicePointer = Member.pointer(requireFixture(alice, 'alice').id)
	const aliceRead = new ACL().grantPrincipal(alicePointer, 'read')
	const aliceUpdate = aliceRead.grantPrincipal(alicePointer, 'update')

	editor = await AppRole.create(
		{
			acl: aliceUpdate,
			description: 'Directly managed by Alice',
			name: 'editor',
		},
		{ ultimabase: app, useMasterKey: true },
	)
	await editor.addMember(alicePointer, { ultimabase: app, useMasterKey: true })

	roleProtected = await AppRole.create(
		{
			acl: new ACL().grantRole(
				AppRole.role({ id: editor.id }),
				'read',
				'update',
			),
			description: 'Resolved through the protected role graph',
			name: 'role-protected',
		},
		{ ultimabase: app, useMasterKey: true },
	)
	parent = await AppRole.create(
		{ acl: aliceUpdate, description: 'Nested parent', name: 'parent' },
		{ ultimabase: app, useMasterKey: true },
	)
	child = await AppRole.create(
		{ acl: aliceRead, description: 'Nested child', name: 'child' },
		{ ultimabase: app, useMasterKey: true },
	)
	deletable = await AppRole.create(
		{
			acl: aliceRead.grantPrincipal(alicePointer, 'delete'),
			description: 'Deletable by Alice',
			name: 'deletable',
		},
		{ ultimabase: app, useMasterKey: true },
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
			const app = getApplication()
			const context = aliceRequest('acl-role-schema-resolution')
			const current = requireFixture(roleProtected, 'role-protected')
			const resolved = await AppRole.query()
				.byId(current.id)
				.select({ description: true, name: true })
				.first({ context, ultimabase: app })

			expect(resolved?.name).toBe('role-protected')
			const persistedACL = await AppRole.query()
				.byId(current.id)
				.select({ acl: true })
				.first({ ultimabase: app, useMasterKey: true })

			expect(
				persistedACL?.acl.permissionsForRole(
					AppRole.role({ id: requireFixture(editor, 'editor').id }),
				),
			).toStrictEqual(['read', 'update'])
			await expect(
				current.update(
					{ description: 'Updated through role ACL' },
					{ context, ultimabase: app },
				),
			).resolves.toMatchObject({ description: 'Updated through role ACL' })
		})

		it('applies ordinary update ACLs to member and nested-role commands', async () => {
			const app = getApplication()
			const context = aliceRequest('acl-role-schema-commands')
			const currentEditor = requireFixture(editor, 'editor')
			const currentParent = requireFixture(parent, 'parent')
			const currentChild = requireFixture(child, 'child')

			await expect(
				currentEditor.addMember(requireFixture(bob, 'bob'), {
					context,
					ultimabase: app,
				}),
			).resolves.toBeUndefined()
			await expect(
				currentParent.addRole(currentChild, { context, ultimabase: app }),
			).resolves.toBeUndefined()
			await expect(
				currentEditor.relation('members').query().count({ ultimabase: app }),
			).resolves.toBe(2)
			await expect(
				currentParent
					.relation('roles')
					.query()
					.count({ context, ultimabase: app }),
			).resolves.toBe(1)
		})

		it('keeps ACL replacement master-only while honoring delete rights', async () => {
			const app = getApplication()
			const context = aliceRequest('acl-role-schema-management')
			const currentEditor = requireFixture(editor, 'editor')

			await expect(
				currentEditor.update(
					{ acl: new ACL().grantPublic('read') },
					{ context, ultimabase: app },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				requireFixture(deletable, 'deletable').delete({
					context,
					ultimabase: app,
				}),
			).resolves.toMatchObject({ name: 'deletable' })
			await expect(
				AppRole.query()
					.select({ acl: true })
					.find({ context, ultimabase: app }),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		})
	},
)
