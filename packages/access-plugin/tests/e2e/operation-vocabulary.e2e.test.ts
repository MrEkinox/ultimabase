import {
	MasterAuthority,
	UltimaBase,
	databasePersistencePlanCapability,
	dateTimeField,
	runWithRequestEngine,
	type PolicyPredicate,
} from '@ultimabase/core'
import { RequestContext, withContext } from '@ultimabase/core/plugin'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { describe, expect, it, onTestFinished } from 'vitest'

import { testDatabaseFilterOperators } from '../../../../tooling/vitest/database-filter-operators.js'
import { MemoryTestDatabase } from '../../../../tooling/vitest/memory-database.js'
import { testDatabasePlugin } from '../../../../tooling/vitest/test-database.js'
import { accessPlugin } from '../../src/index.js'

// ADR-0347 decision 1: Access rules take the shared vocabulary. The most
// precise key wins (method > operation > group > all), a write rule never
// depends on cardinality, and a plugin operation key covers its One and Many
// commands. No rule may be widened by the vocabulary.
const archivePlugin = definePlugin({
	name: '@fixture/vocabulary-archive',
	features: {
		archivable: feature({
			fields: { archivedAt: dateTimeField() },
			commands: {
				archiveOne: command({
					authority: 'request',
					effect: 'update',
					data: () => ({ archivedAt: '2026-10-18T00:00:00.000Z' }),
				}),
			},
		}),
	},
})

const App = UltimaBase.use(accessPlugin(), softDeletePlugin(), archivePlugin)

const adminId = '0199325a-0c00-7000-8000-000000000b01'
const memberId = '0199325a-0c00-7000-8000-000000000b02'

const isMember: PolicyPredicate = ({ principal }) => principal !== undefined
const isAdmin: PolicyPredicate = ({ principal }) => principal?.id === adminId

const Member = App.Schema.define({
	className: 'VocabularyMember',
	fields: (field) => ({ name: field.string() }),
}).with({ access: { read: true } })

// `archiveOne` comes from a plugin the rules never name: `write` covers it.
const Note = App.Schema.define({
	className: 'VocabularyNote',
	fields: (field) => ({ title: field.string() }),
	softDelete: { mode: 'command' },
	archivable: true,
}).with({
	access: {
		read: true,
		write: isMember,
		create: isAdmin,
		softDelete: isAdmin,
		restore: false,
	},
})

const Listing = App.Schema.define({
	className: 'VocabularyListing',
	fields: (field) => ({ title: field.string() }),
}).with({ access: { read: true, findMany: false } })

const noteId = '0199325a-0c00-7000-8000-000000000c01'
const deletedId = '0199325a-0c00-7000-8000-000000000c02'
const listingId = '0199325a-0c00-7000-8000-000000000c03'
const timestamps = {
	createdAt: '2026-10-18T00:00:00.000Z',
	updatedAt: '2026-10-18T00:00:00.000Z',
}

const start = async () => {
	const database = new MemoryTestDatabase({
		capabilities: {
			filterOperators: testDatabaseFilterOperators,
			persistencePlans: databasePersistencePlanCapability,
		},
		rows: {
			VocabularyListing: [{ ...timestamps, id: listingId, title: 'listed' }],
			VocabularyMember: [],
			VocabularyNote: [
				{
					...timestamps,
					archivedAt: null,
					deletedAt: null,
					id: noteId,
					isDeleted: false,
					title: 'live',
				},
				{
					...timestamps,
					archivedAt: null,
					deletedAt: '2026-10-18T00:00:00.000Z',
					id: deletedId,
					isDeleted: true,
					title: 'deleted',
				},
			],
		},
	})
	const ultimabase = new (App.use(
		testDatabasePlugin(database, { id: 'fixture.vocabulary-database' }),
	))({
		logger: false,
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'vocabulary-master', value: 'unused' }],
			onUse: () => undefined,
		}),
		schemas: [Member, Note, Listing],
	})
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	return { database, ultimabase }
}

type Application = Awaited<ReturnType<typeof start>>['ultimabase']

/** Runs `operation` as the given caller; `undefined` is anonymous. */
const as = <TResult>(
	ultimabase: Application,
	principalId: string | undefined,
	operation: () => Promise<TResult>,
): Promise<TResult> => {
	const anonymous = RequestContext.anonymous({
		requestId: 'vocabulary',
		source: 'internal',
	})
	const context =
		principalId === undefined
			? anonymous
			: anonymous.withPrincipal(Member.pointer(principalId))
	return runWithRequestEngine(withContext(ultimabase, context), operation)
}

const denied = { code: 'PERMISSION_DENIED' }

describe('Access rule vocabulary (ADR-0347)', () => {
	it('lets write cover the commands of a plugin the rules never name', async () => {
		const { ultimabase } = await start()
		const can = (principalId: string | undefined) =>
			ultimabase.can({
				operation: 'archive',
				principal:
					principalId === undefined ? undefined : Member.pointer(principalId),
				schema: Note,
			})

		await expect(can(undefined)).resolves.toBe(false)
		await expect(can(memberId)).resolves.toBe(true)
		await expect(
			as(ultimabase, undefined, () =>
				Note.updateOne({ id: noteId, data: { title: 'x' } }),
			),
		).rejects.toMatchObject(denied)
		await expect(
			as(ultimabase, memberId, () =>
				Note.updateOne({ id: noteId, data: { title: 'member' } }),
			),
		).resolves.toMatchObject({ title: 'member' })
	})

	it('lets the softDelete operation win over write, for One and Many', async () => {
		const { database, ultimabase } = await start()

		await expect(
			as(ultimabase, memberId, () => Note.softDeleteOne({ id: noteId })),
		).rejects.toMatchObject(denied)
		await expect(
			as(ultimabase, memberId, () =>
				Note.softDeleteMany({ where: { title: { eq: 'live' } } }),
			),
		).rejects.toMatchObject(denied)
		expect(database.rows('VocabularyNote')[0]?.isDeleted).toBe(false)

		await expect(
			as(ultimabase, adminId, () => Note.softDeleteOne({ id: noteId })),
		).resolves.toStrictEqual({ id: noteId })
		expect(database.rows('VocabularyNote')[0]?.isDeleted).toBe(true)
	})

	it('governs a createMany request with the create rule', async () => {
		const { database, ultimabase } = await start()

		await expect(
			as(ultimabase, memberId, () =>
				Note.createMany({ data: [{ title: 'a' }, { title: 'b' }] }),
			),
		).rejects.toMatchObject(denied)
		expect(database.rows('VocabularyNote')).toHaveLength(2)

		await expect(
			as(ultimabase, adminId, () =>
				Note.createMany({ data: [{ title: 'a' }, { title: 'b' }] }),
			),
		).resolves.toHaveLength(2)
		expect(database.rows('VocabularyNote')).toHaveLength(4)
	})

	it('lets findMany: false refuse listing while read still opens findOne', async () => {
		const { ultimabase } = await start()

		await expect(
			as(ultimabase, undefined, () =>
				Listing.findOne({ where: { id: { eq: listingId } } }),
			),
		).resolves.toMatchObject({ title: 'listed' })
		await expect(
			as(ultimabase, undefined, () => Listing.findMany({})),
		).rejects.toMatchObject(denied)
	})

	it('lets restore: false refuse both restoreOne and restoreMany', async () => {
		const { database, ultimabase } = await start()

		await expect(
			as(ultimabase, adminId, () => Note.restoreOne({ id: deletedId })),
		).rejects.toMatchObject(denied)
		await expect(
			as(ultimabase, adminId, () =>
				Note.restoreMany({ where: { title: { eq: 'deleted' } } }),
			),
		).rejects.toMatchObject(denied)
		expect(database.rows('VocabularyNote')[1]?.isDeleted).toBe(true)
	})

	it('still lets Master bypass every rule', async () => {
		const { database, ultimabase } = await start()

		await expect(
			Note.restoreOne({ id: deletedId }, { useMasterKey: true }),
		).resolves.toStrictEqual({ id: deletedId })
		await expect(
			Listing.findMany({}, { useMasterKey: true }),
		).resolves.toHaveLength(1)
		expect(database.rows('VocabularyNote')[1]?.isDeleted).toBe(false)
		await expect(
			ultimabase.can({
				operation: 'restore',
				principal: Member.pointer(adminId),
				schema: Note,
			}),
		).resolves.toBe(false)
	})

	it('answers can() for operations and read methods', async () => {
		const { ultimabase } = await start()
		const can = (operation: string, principalId?: string) =>
			ultimabase.can({
				operation,
				principal:
					principalId === undefined ? undefined : Member.pointer(principalId),
				schema:
					operation === 'findMany' || operation === 'find' ? Listing : Note,
			})

		await expect(can('softDelete', adminId)).resolves.toBe(true)
		await expect(can('softDelete', memberId)).resolves.toBe(false)
		await expect(can('restore', adminId)).resolves.toBe(false)
		await expect(can('create', adminId)).resolves.toBe(true)
		await expect(can('create', memberId)).resolves.toBe(false)
		await expect(can('update', memberId)).resolves.toBe(true)
		await expect(can('findOne')).resolves.toBe(true)
		await expect(can('findMany')).resolves.toBe(false)
		// `find` covers findOne and findMany: allowed only when both are.
		await expect(can('find')).resolves.toBe(false)
		await expect(can('softDeleteOne', adminId)).rejects.toThrow(
			'can() received an unknown operation for VocabularyNote: softDeleteOne',
		)
		await expect(can('one')).rejects.toThrow(
			'can() received an unknown operation for VocabularyNote: one',
		)
	})
})
