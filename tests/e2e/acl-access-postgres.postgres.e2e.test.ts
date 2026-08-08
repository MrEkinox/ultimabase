import { aclPostgresPlugin } from '@ultimabase/acl-postgres-plugin'
import { ACL, acl, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	AccessSubjectReference,
	accessPrincipalResolverServiceToken,
	accessRoleResolverServiceToken,
	definePlugin,
	MasterAuthority,
	RequestContext,
	RequestContextValue,
	requestSources,
	Schema,
	stringField,
	UltimaBase,
} from '@ultimabase/core'
import { postgresPlugin, postgresTable } from '@ultimabase/postgres-plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const Principal = Schema.define({
	className: 'ACLAccessPrincipal',
	fields: {},
})
const currentPrincipalId = new RequestContextValue<string>(
	'fixture.acl.principal-id',
	(value: unknown): string => {
		if (typeof value !== 'string') {
			throw new TypeError('ACL fixture principal id must be a string')
		}

		return value
	},
)
const currentRoleIds = new RequestContextValue<readonly string[]>(
	'fixture.acl.role-ids',
	(value: unknown): readonly string[] => {
		if (
			!Array.isArray(value) ||
			!value.every((role): role is string => typeof role === 'string')
		) {
			throw new TypeError('ACL fixture role ids must be strings')
		}

		return immutableArray(value)
	},
)
const identityPlugin = definePlugin({
	name: 'fixture.acl-identity',
	setup: ({ services }) => {
		services.provide(accessPrincipalResolverServiceToken, {
			resolveCurrent: ({ context }) => {
				const principalId = context.getValue(currentPrincipalId)

				return principalId === undefined
					? undefined
					: Principal.pointer(principalId)
			},
		})
		services.provide(accessRoleResolverServiceToken, {
			hasRole: ({ context, role }) =>
				context.getValue(currentRoleIds)?.includes(role.value) ?? false,
			resolveCurrentRoles: ({ context }) =>
				(context.getValue(currentRoleIds) ?? []).map(
					(role) => new AccessSubjectReference('role', role),
				),
			resolvePersistentRole: ({ role }) => role,
		})

		return undefined
	},
})
const emptyACL = new ACL()
const ProtectedPost = Schema.define({
	className: 'ACLAccessPost',
	fields: {
		marker: stringField({ default: 'original' }),
		title: stringField({ validation: { required: true } }),
	},
	extensions: [
		acl({
			default: emptyACL,
			resolveInput: ({ currentAcl, inputAcl }) =>
				inputAcl ?? currentAcl ?? emptyACL,
		}),
		postgresTable({ name: 'acl_access_posts' }),
	],
})
const aliceId = '0198a43e-2431-7000-8000-000000000070'
const bobId = '0198a43e-2431-7000-8000-000000000071'
const editorRoleId = 'fixture-role-editor-stable-id'
const reviewerRoleId = 'fixture-role-reviewer-stable-id'
const editorRole = new AccessSubjectReference('role', editorRoleId)
const reviewerRole = new AccessSubjectReference('role', reviewerRoleId)

let fixture: PostgresWorkerFixture | undefined
let ultimabase:
	| UltimaBase<
			readonly [typeof Principal, typeof ProtectedPost],
			readonly [
				typeof identityPlugin,
				ReturnType<typeof aclPlugin>,
				ReturnType<typeof postgresPlugin>,
				ReturnType<typeof aclPostgresPlugin>,
			]
	  >
	| undefined
let rowIds: Readonly<Record<string, string>> = immutableRecord({})

const getApplication = (): NonNullable<typeof ultimabase> => {
	if (ultimabase === undefined) {
		throw new TypeError('ACL Access application is missing')
	}

	return ultimabase
}

const request = (requestId: string) =>
	RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
	})

/** Fails setup mistakes explicitly instead of querying with a synthetic identifier. */
const requireRowId = (title: string): string => {
	const rowId = rowIds[title]

	if (rowId === undefined) {
		throw new TypeError(`ACL Access fixture row is missing: ${title}`)
	}

	return rowId
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-access-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		plugins: [
			identityPlugin,
			aclPlugin(),
			postgresPlugin({
				schemaPolicy: 'override',
				url: fixture.connectionUri,
			}),
			aclPostgresPlugin(),
		],
		schemas: [Principal, ProtectedPost],
	})
	await ultimabase.start()

	const created = await ProtectedPost.createMany(
		{
			data: [
				{ acl: new ACL().grantPublic('read'), title: 'public' },
				{ acl: new ACL().grantAuthenticated('read'), title: 'authenticated' },
				{
					acl: new ACL().grantPrincipal(
						Principal.pointer(aliceId),
						'read',
						'update',
						'delete',
					),
					title: 'alice',
				},
				{
					acl: new ACL().grantPrincipal(Principal.pointer(bobId), 'read'),
					title: 'bob',
				},
				{
					acl: new ACL().grantRole(editorRole, 'read', 'update', 'delete'),
					title: 'editor',
				},
				{
					acl: new ACL()
						.grantPrincipal(Principal.pointer(aliceId), 'read')
						.grantPrincipal(Principal.pointer(bobId), 'read')
						.grantRole(editorRole, 'read', 'update')
						.grantRole(reviewerRole, 'read'),
					title: 'shared',
				},
				{ acl: new ACL(), title: 'denied' },
			],
		},
		{ ultimabase, useMasterKey: true },
	)

	rowIds = immutableRecord(
		Object.fromEntries(created.map(({ id, title }) => [title, id] as const)),
	)
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('ACL PostgreSQL Access constraints', { concurrent: false }, () => {
	it('filters public, authenticated, principal, and role reads in SQL', async () => {
		const app = getApplication()
		const anonymous = request('acl-anonymous')
		const alice = request('acl-alice').withValue(currentPrincipalId, aliceId)
		const bob = request('acl-bob').withValue(currentPrincipalId, bobId)
		const editor = request('acl-editor').withValue(currentRoleIds, [
			editorRoleId,
		])
		const reviewer = request('acl-reviewer').withValue(currentRoleIds, [
			reviewerRoleId,
		])
		const visibleTitles = (context: RequestContext) =>
			ProtectedPost.findMany(
				{ orderBy: [{ title: 'asc' }], select: { title: true } },
				{ context, ultimabase: app },
			).then((rows) => rows.map(({ title }) => title))

		await expect(visibleTitles(anonymous)).resolves.toStrictEqual(['public'])
		await expect(visibleTitles(alice)).resolves.toStrictEqual([
			'alice',
			'authenticated',
			'public',
			'shared',
		])
		await expect(visibleTitles(bob)).resolves.toStrictEqual([
			'authenticated',
			'bob',
			'public',
			'shared',
		])
		await expect(visibleTitles(editor)).resolves.toStrictEqual([
			'editor',
			'public',
			'shared',
		])
		await expect(visibleTitles(reviewer)).resolves.toStrictEqual([
			'public',
			'shared',
		])
		await expect(
			ProtectedPost.count({}, { context: alice, ultimabase: app }),
		).resolves.toBe(4)
		await expect(
			ProtectedPost.exists(
				{ where: { title: { eq: 'denied' } } },
				{ context: alice, ultimabase: app },
			),
		).resolves.toBe(false)
	})

	it('combines ACL with developer filters for singular and bulk mutations', async () => {
		const app = getApplication()
		const alice = request('acl-alice-mutations').withValue(
			currentPrincipalId,
			aliceId,
		)
		const editor = request('acl-editor-mutations').withValue(currentRoleIds, [
			editorRoleId,
		])
		const aliceUpdated = await ProtectedPost.updateMany(
			{
				data: [
					{
						where: { id: { eq: requireRowId('alice') } },
						data: { marker: 'alice-updated' },
					},
				],
			},
			{ context: alice, ultimabase: app },
		)
		const deniedUpdate = await ProtectedPost.updateOne(
			{
				where: (where) => where.eq('id', requireRowId('bob')),
				data: { marker: 'forbidden' },
			},
			{ context: alice, ultimabase: app },
		)
		const editorUpdated = await ProtectedPost.updateOne(
			{
				where: (where) => where.eq('id', requireRowId('editor')),
				data: { marker: 'editor-updated' },
			},
			{ context: editor, ultimabase: app },
		)

		expect(aliceUpdated).toHaveLength(1)
		expect(deniedUpdate).toBeNull()
		expect(editorUpdated?.marker).toBe('editor-updated')

		await expect(
			ProtectedPost.deleteMany(
				{ where: [{ id: { eq: requireRowId('alice') } }] },
				{ context: alice, ultimabase: app },
			),
		).resolves.toHaveLength(1)
		await expect(
			ProtectedPost.deleteOne(
				{ where: (where) => where.eq('id', requireRowId('editor')) },
				{ context: editor, ultimabase: app },
			),
		).resolves.toMatchObject({ title: 'editor' })
		await expect(
			ProtectedPost.count({}, { ultimabase: app, useMasterKey: true }),
		).resolves.toBe(5)
	})

	it('allows itemized master updates while rejecting ACL upserts', async () => {
		const app = getApplication()
		const deniedId = requireRowId('denied')
		const replacement = new ACL().grantPublic('read', 'update')
		const masterOptions = { ultimabase: app, useMasterKey: true } as const
		const attempts = [
			() =>
				ProtectedPost.updateMany(
					{
						data: [
							{
								where: { id: { eq: deniedId } },
								data: { acl: replacement },
							},
						],
					},
					masterOptions,
				),
			() =>
				ProtectedPost.upsertOne(
					{
						where: (where) => where.eq('id', deniedId),
						create: { title: 'unexpected-upsert' },
						update: { acl: replacement },
					},
					masterOptions,
				),
			() =>
				ProtectedPost.upsertMany(
					{
						data: [
							{
								create: { title: 'unexpected-bulk-upsert' },
								where: (where) => where.eq('id', deniedId),
								update: { acl: replacement },
							},
						],
					},
					masterOptions,
				),
		] as const

		const [updateManyAttempt, ...upsertAttempts] = attempts

		await expect(updateManyAttempt()).resolves.toBeDefined()

		for (const attempt of upsertAttempts) {
			await expect(attempt()).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
			})
		}

		const persisted = await ProtectedPost.findOne(
			{ where: { id: { eq: deniedId } }, select: { acl: true } },
			masterOptions,
		)

		expect(persisted?.acl).toStrictEqual(replacement)
	})
})
