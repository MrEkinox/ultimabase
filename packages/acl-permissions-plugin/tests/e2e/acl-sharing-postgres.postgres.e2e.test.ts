import { ACL, aclPlugin } from '@ultimabase/acl-permissions-plugin'
import {
	MasterAuthority,
	UltimaBase,
	type FrameworkError,
	type Model,
} from '@ultimabase/core'
import {
	RequestContext,
	RequestContextValue,
	plugin,
	requestSources,
} from '@ultimabase/core/plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { provideTestPrincipalResolver } from '../../../../tests/fixtures/access-capability-fixtures.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

// ADR-0321: atomic sharing, client sharing on explicit permission, the
// no-escalation guard, `select: { acl }` rules and readable entries.
const currentUserId = new RequestContextValue<string>(
	'fixture.acl-sharing.user-id',
	(value) => {
		if (typeof value !== 'string' || value.length === 0) {
			throw new TypeError('ACL sharing user id must be a string')
		}
		return value
	},
)
const ShareApplication = UltimaBase.use(aclPlugin())
const ShareUser = ShareApplication.Schema.define({
	className: 'ACLShareUser',
	fields: (field) => ({ email: field.string({ required: true }) }),
}).with({})
const identityPlugin = plugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'fixture.acl-sharing.identity',
	contributions: [
		provideTestPrincipalResolver({
			resolveCurrent: ({ context }) => {
				const id = context.getValue(currentUserId)
				return id === undefined ? undefined : ShareUser.pointer(id)
			},
		}),
	],
})
const SharedNote = ShareApplication.Schema.define({
	className: 'ACLSharedNote',
	fields: (field) => ({ body: field.string({ required: true }) }),
})
	.acl()
	.with({
		acl: {
			default: ({ principal }) => new ACL(principal),
			// Whoever may update a note may share it.
			clientSharing: ({ principal, currentAcl }) =>
				principal !== undefined &&
				currentAcl.hasPrincipalPermission(principal, 'update'),
		},
	})
const PrivateNote = ShareApplication.Schema.define({
	className: 'ACLPrivateNote',
	fields: (field) => ({ body: field.string({ required: true }) }),
})
	.acl()
	.with({ acl: { default: ({ principal }) => new ACL(principal) } })

type User = Model<typeof ShareUser>

let fixture: PostgresWorkerFixture | undefined
let ultimabase: Awaited<ReturnType<typeof createApplication>> | undefined
let owner: User | undefined
let friend: User | undefined
let stranger: User | undefined

const createApplication = (connectionUri: string) =>
	new (UltimaBase.use(
		identityPlugin,
		aclPlugin(),
		postgresPlugin({ schemaPolicy: 'override', url: connectionUri }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-sharing-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		schemas: [ShareUser, SharedNote, PrivateNote],
	})

const required = <TValue>(value: TValue | undefined, label: string): TValue => {
	if (value === undefined) throw new TypeError(`Missing fixture: ${label}`)
	return value
}

const as = (user: User | undefined, requestId: string) => ({
	context: RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
	}).withValue(currentUserId, required(user, 'user').id),
})
const master = { useMasterKey: true } as const

const pointer = (user: User | undefined) =>
	ShareUser.pointer(required(user, 'user').id)

const createNote = (body: string) =>
	SharedNote.createOne({ data: { body } }, as(owner, `create-${body}`))

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = createApplication(fixture.connectionUri)
	await ultimabase.start()
	;[owner, friend, stranger] = await ShareUser.createMany(
		{
			data: [
				{ email: 'owner@x.test' },
				{ email: 'friend@x.test' },
				{ email: 'stranger@x.test' },
			],
		},
		master,
	)
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('ACL sharing with PostgreSQL', { concurrent: false }, () => {
	it('lets a client share and unshare a row it may share', async () => {
		const note = await createNote('shared')
		const read = () =>
			SharedNote.findOne({ where: { id: note.id } }, as(friend, 'friend-read'))

		await expect(read()).resolves.toBeNull()
		await SharedNote.updateOne(
			{
				where: { id: note.id },
				data: {
					acl: { grant: { principal: pointer(friend), permissions: ['read'] } },
				},
			},
			as(owner, 'owner-grant'),
		)
		await expect(read()).resolves.toMatchObject({ id: note.id })
		await SharedNote.updateOne(
			{
				where: { id: note.id },
				data: { acl: { revoke: { principal: pointer(friend) } } },
			},
			as(owner, 'owner-revoke'),
		)
		await expect(read()).resolves.toBeNull()
	})

	it('never lets a client grant rights it does not hold', async () => {
		const note = await createNote('escalation')
		await SharedNote.updateOne(
			{
				where: { id: note.id },
				data: {
					acl: {
						grant: {
							principal: pointer(friend),
							permissions: ['read', 'update'],
						},
					},
				},
			},
			as(owner, 'owner-grants-editor'),
		)
		const share = (permissions: readonly ('delete' | 'read')[]) =>
			SharedNote.updateOne(
				{
					where: { id: note.id },
					data: {
						acl: { grant: { principal: pointer(stranger), permissions } },
					},
				},
				as(friend, `friend-shares-${permissions.join('-')}`),
			)

		await expect(share(['delete'])).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
			internalDetails: { kind: 'acl-sharing-escalation' },
		} satisfies Partial<FrameworkError>)
		await expect(share(['read'])).resolves.toMatchObject({ id: note.id })
		// Stranger reads the row but may not update it: clientSharing refuses.
		await expect(
			SharedNote.updateOne(
				{
					where: { id: note.id },
					data: {
						acl: {
							grant: { principal: pointer(owner), permissions: ['read'] },
						},
					},
				},
				as(stranger, 'stranger-shares'),
			),
		).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
			internalDetails: { kind: 'acl-sharing-denied' },
		} satisfies Partial<FrameworkError>)
		// A caller who cannot read the row does not find it.
		await expect(
			SharedNote.updateOne(
				{
					where: { id: note.id },
					data: { acl: { revoke: { principal: pointer(owner) } } },
				},
				as(
					await ShareUser.createOne(
						{ data: { email: 'outsider@x.test' } },
						master,
					),
					'outsider-shares',
				),
			),
		).resolves.toBeNull()
	})

	it('refuses client sharing without clientSharing and client replacements', async () => {
		const note = await PrivateNote.createOne(
			{ data: { body: 'private' } },
			as(owner, 'private-create'),
		)
		await expect(
			PrivateNote.updateOne(
				{
					where: { id: note.id },
					data: {
						acl: {
							grant: { principal: pointer(friend), permissions: ['read'] },
						},
					},
				},
				as(owner, 'private-grant'),
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		const shared = await createNote('replacement')
		await expect(
			SharedNote.updateOne(
				{
					where: { id: shared.id },
					data: { acl: new ACL().grantPublic('read') },
				},
				as(owner, 'owner-replaces'),
			),
		).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
		} satisfies Partial<FrameworkError>)
		// Master shares any row.
		await expect(
			PrivateNote.updateOne(
				{
					where: { id: note.id },
					data: {
						acl: {
							grant: { principal: pointer(friend), permissions: ['read'] },
						},
					},
				},
				master,
			),
		).resolves.toMatchObject({ id: note.id })
	})

	it('applies concurrent grants without losing one', async () => {
		const note = await createNote('concurrent')
		const users = await ShareUser.createMany(
			{
				data: Array.from({ length: 8 }, (_, index) => ({
					email: `concurrent-${String(index)}@x.test`,
				})),
			},
			master,
		)
		await Promise.all(
			users.map((user) =>
				SharedNote.updateOne(
					{
						where: { id: note.id },
						data: {
							acl: {
								grant: {
									principal: ShareUser.pointer(user.id),
									permissions: ['read'],
								},
							},
						},
					},
					master,
				),
			),
		)
		const stored = await SharedNote.findOneOrThrow(
			{ where: { id: note.id }, select: { acl: true } },
			master,
		)
		for (const user of users) {
			expect(
				stored.acl.hasPrincipalPermission(ShareUser.pointer(user.id), 'read'),
			).toBe(true)
		}
		await Promise.all(
			users.map((user) =>
				SharedNote.updateOne(
					{
						where: { id: note.id },
						data: {
							acl: { revoke: { principal: ShareUser.pointer(user.id) } },
						},
					},
					master,
				),
			),
		)
		const revoked = await SharedNote.findOneOrThrow(
			{ where: { id: note.id }, select: { acl: true } },
			master,
		)
		expect(revoked.acl.toJSON().principals).toHaveLength(1)
	})

	it('selects the acl for Master and for rows the caller may share', async () => {
		const note = await createNote('selected')
		await SharedNote.updateOne(
			{
				where: { id: note.id },
				data: {
					acl: { grant: { principal: pointer(friend), permissions: ['read'] } },
				},
			},
			as(owner, 'owner-grants-reader'),
		)
		const asOwner = await SharedNote.findOneOrThrow(
			{ where: { id: note.id }, select: { body: true, acl: true } },
			as(owner, 'owner-selects-acl'),
		)
		expect(asOwner.acl.hasPrincipalPermission(pointer(friend), 'read')).toBe(
			true,
		)
		// Friend reads the row but may not share it: its acl is refused.
		await expect(
			SharedNote.findOne(
				{ where: { id: note.id }, select: { body: true, acl: true } },
				as(friend, 'friend-selects-acl'),
			),
		).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
			internalDetails: { kind: 'acl-select-not-shareable' },
		})
		await expect(
			SharedNote.findOne(
				{ where: { id: note.id }, select: { body: true } },
				as(friend, 'friend-selects-body'),
			),
		).resolves.toMatchObject({ body: 'selected' })
		await expect(
			PrivateNote.findMany(
				{ select: { acl: true } },
				as(owner, 'private-select'),
			),
		).rejects.toThrow(
			'select: { acl: true } on ACLPrivateNote requires useMasterKey: true',
		)
		const asMaster = await SharedNote.findOneOrThrow(
			{ where: { id: note.id }, select: { acl: true } },
			master,
		)
		const principals = asMaster.acl
			.entries()
			.flatMap((entry) =>
				entry.kind === 'principal' ? [entry.principal.id] : [],
			)
		expect(principals.sort()).toStrictEqual(
			[required(owner, 'owner').id, required(friend, 'friend').id].sort(),
		)
		expect(
			asMaster.acl
				.entries()
				.every(
					(entry) =>
						entry.kind !== 'principal' || entry.principal.schema === ShareUser,
				),
		).toBe(true)
	})
})
