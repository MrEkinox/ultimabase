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
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { provideTestPrincipalResolver } from '../../../../tests/fixtures/access-capability-fixtures.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

// Pins which ACL row right a plugin write command needs. Plugin commands run
// on native steps (ADR-0344): their effect, not their name, picks the right.
const currentMemberId = new RequestContextValue<string>(
	'fixture.acl-plugin-commands.member-id',
	(value) => {
		if (typeof value !== 'string' || value.length === 0) {
			throw new TypeError('ACL plugin command member id must be a string')
		}
		return value
	},
)
const CommandApplication = UltimaBase.use(aclPlugin(), softDeletePlugin())
const CommandMember = CommandApplication.Schema.define({
	className: 'ACLCommandMember',
	fields: (field) => ({ name: field.string({ required: true }) }),
})
const identityPlugin = plugin({
	version: '0.0.0',
	core: '^0.0.0',
	id: 'fixture.acl-plugin-commands.identity',
	contributions: [
		provideTestPrincipalResolver({
			resolveCurrent: ({ context }) => {
				const id = context.getValue(currentMemberId)
				return id === undefined ? undefined : CommandMember.pointer(id)
			},
		}),
	],
})
/** `softDelete: true`: deleteOne soft-deletes too. */
const CommandNote = CommandApplication.Schema.define({
	className: 'ACLCommandNote',
	fields: (field) => ({ title: field.string({ required: true }) }),
	acl: true,
	softDelete: true,
}).with({ acl: { default: () => new ACL() } })

type Member = Pick<Model<typeof CommandMember>, 'id'>
type Right = 'delete' | 'read' | 'update'

let fixture: PostgresWorkerFixture | undefined
let ultimabase: Awaited<ReturnType<typeof createApplication>> | undefined
let member: Member | undefined

const createApplication = (connectionUri: string) =>
	new (UltimaBase.use(
		identityPlugin,
		aclPlugin(),
		softDeletePlugin(),
		postgresPlugin({ schemaPolicy: 'override', url: connectionUri }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'acl-plugin-commands-e2e', value: 'server-only' }],
			onUse: () => undefined,
		}),
		schemas: [CommandMember, CommandNote],
	})

const required = <TValue>(value: TValue | undefined, label: string): TValue => {
	if (value === undefined) throw new TypeError(`Missing fixture: ${label}`)
	return value
}
const master = { useMasterKey: true } as const
const asMember = () => ({
	context: RequestContext.anonymous({
		requestId: 'acl-plugin-command',
		source: requestSources.internal,
	}).withValue(currentMemberId, required(member, 'member').id),
})

/** Creates a note the member holds exactly `rights` on, hidden when `deleted`. */
const noteWith = async (rights: readonly Right[], deleted = false) => {
	const principal = CommandMember.pointer(required(member, 'member').id)
	const acl =
		rights.length === 0
			? new ACL()
			: new ACL().grantPrincipal(principal, ...rights)
	const note = await CommandNote.createOne(
		{ data: { title: 'Plans', acl } },
		master,
	)
	if (deleted) await CommandNote.softDeleteOne({ id: note.id }, master)
	return note.id
}

/** Reads the tombstone as Master; `undefined` when the row is gone. */
const tombstone = async (id: string) => {
	const visible = await CommandNote.findOne({ where: { id } }, master)
	if (visible !== null) return visible.isDeleted
	const hidden = await CommandNote.findOne(
		{ where: { id, isDeleted: true } },
		master,
	)
	return hidden?.isDeleted
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
	ultimabase = createApplication(fixture.connectionUri)
	await ultimabase.start()
	member = await CommandMember.createOne({ data: { name: 'Ada' } }, master)
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

// A refused command finds no row: it writes nothing and reveals nothing.
const refusedOne = async (operation: Promise<unknown>) => {
	await expect(operation).rejects.toMatchObject({
		code: 'NOT_FOUND',
	} satisfies Partial<FrameworkError>)
}

const rows = (rights: readonly Right[]) => ({
	label: rights.length === 0 ? 'no right' : rights.join(' and '),
	rights,
})

describe('ACL rights on plugin write commands', { concurrent: false }, () => {
	// The command's effect picks the right: Soft Delete's commands update.
	const granted = ([['update'], ['read', 'update']] as const).map(rows)
	const refused = ([[], ['read'], ['delete'], ['read', 'delete']] as const).map(
		rows,
	)

	it.each(granted)(
		'softDeleteOne and restoreOne pass with $label',
		async ({ rights }) => {
			const id = await noteWith(rights)
			await expect(
				CommandNote.softDeleteOne({ id }, asMember()),
			).resolves.toStrictEqual({ id })
			expect(await tombstone(id)).toBe(true)
			await expect(
				CommandNote.restoreOne({ id }, asMember()),
			).resolves.toStrictEqual({ id })
			expect(await tombstone(id)).toBe(false)
		},
	)

	it.each(refused)(
		'softDeleteOne and restoreOne are refused with $label',
		async ({ rights }) => {
			const visible = await noteWith(rights)
			await refusedOne(CommandNote.softDeleteOne({ id: visible }, asMember()))
			expect(await tombstone(visible)).toBe(false)
			const hidden = await noteWith(rights, true)
			await refusedOne(CommandNote.restoreOne({ id: hidden }, asMember()))
			expect(await tombstone(hidden)).toBe(true)
		},
	)

	it.each(refused)(
		'softDeleteMany and restoreMany skip rows refused with $label',
		async ({ rights }) => {
			const visible = await noteWith(rights)
			await expect(
				CommandNote.softDeleteMany({ where: { id: visible } }, asMember()),
			).resolves.toStrictEqual([])
			expect(await tombstone(visible)).toBe(false)
			const hidden = await noteWith(rights, true)
			await expect(
				CommandNote.restoreMany({ where: { id: hidden } }, asMember()),
			).resolves.toStrictEqual([])
			expect(await tombstone(hidden)).toBe(true)
		},
	)

	it('keeps the delete right for deleteOne, which soft-deletes here', async () => {
		const id = await noteWith(['read', 'update'])
		await expect(
			CommandNote.deleteOne({ where: { id } }, asMember()),
		).resolves.toBeNull()
		expect(await tombstone(id)).toBe(false)
		const deletable = await noteWith(['delete'])
		await CommandNote.deleteOne({ where: { id: deletable } }, asMember())
		expect(await tombstone(deletable)).toBe(true)
	})
})
