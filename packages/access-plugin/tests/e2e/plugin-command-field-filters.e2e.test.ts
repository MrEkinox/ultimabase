import { UltimaBase, databasePersistencePlanCapability } from '@ultimabase/core'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { describe, expect, it, onTestFinished } from 'vitest'

import { testDatabaseFilterOperators } from '../../../../tooling/vitest/database-filter-operators.js'
import { MemoryTestDatabase } from '../../../../tooling/vitest/memory-database.js'
import { testDatabasePlugin } from '../../../../tooling/vitest/test-database.js'
import { accessPlugin } from '../../src/index.js'

// ADR-0316 decision 6 and ADR-0344: the `where` of a many-row plugin command
// obeys the field `where` read rules like any read, so its result cannot
// reveal which rows match a hidden value.
const App = UltimaBase.use(accessPlugin(), softDeletePlugin())

const Note = App.Schema.define({
	className: 'FieldFilterNote',
	fields: (field) => ({
		code: field.string({ access: { read: { where: false } } }),
		title: field.string(),
	}),
	softDelete: { mode: 'command' },
}).with({
	access: {
		read: true,
		restore: true,
		softDelete: true,
	},
})

const noteId = '0199325a-0c00-7000-8000-000000000a01'
const timestamps = {
	createdAt: '2026-10-17T00:00:00.000Z',
	updatedAt: '2026-10-17T00:00:00.000Z',
}

const start = async (deleted: boolean) => {
	const database = new MemoryTestDatabase({
		capabilities: {
			filterOperators: testDatabaseFilterOperators,
			persistencePlans: databasePersistencePlanCapability,
		},
		rows: {
			FieldFilterNote: [
				{
					...timestamps,
					code: 'secret',
					deletedAt: deleted ? '2026-10-17T00:00:00.000Z' : null,
					id: noteId,
					isDeleted: deleted,
					title: 'a',
				},
			],
		},
	})
	const ultimabase = new (App.use(
		testDatabasePlugin(database, { id: 'fixture.field-filter-database' }),
	))({ logger: false, schemas: [Note] })
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	return database
}

const denied = { code: 'PERMISSION_DENIED' }

describe('field where rules on plugin command filters', () => {
	it('refuses a native read filtering on the hidden field', async () => {
		await start(false)

		await expect(
			Note.findMany({ where: { code: { eq: 'secret' } } }),
		).rejects.toMatchObject(denied)
	})

	it('refuses softDeleteMany filtering on the hidden field and writes nothing', async () => {
		const database = await start(false)

		await expect(
			Note.softDeleteMany({ where: { code: { eq: 'secret' } } }),
		).rejects.toMatchObject(denied)
		// A missing value is refused the same way: no oracle.
		await expect(
			Note.softDeleteMany({ where: { code: { eq: 'other' } } }),
		).rejects.toMatchObject(denied)
		expect(database.rows('FieldFilterNote')[0]?.isDeleted).toBe(false)
	})

	it('refuses restoreMany filtering on the hidden field and writes nothing', async () => {
		const database = await start(true)

		await expect(
			Note.restoreMany({ where: { code: { eq: 'secret' } } }),
		).rejects.toMatchObject(denied)
		expect(database.rows('FieldFilterNote')[0]?.isDeleted).toBe(true)
	})

	it('still runs many-row and one-row commands on readable filters', async () => {
		const database = await start(false)

		await expect(
			Note.softDeleteMany({ where: { title: { eq: 'a' } } }),
		).resolves.toStrictEqual([{ id: noteId }])
		await expect(
			Note.restoreMany({ where: { title: { eq: 'a' } } }),
		).resolves.toStrictEqual([{ id: noteId }])
		await expect(Note.softDeleteOne({ id: noteId })).resolves.toStrictEqual({
			id: noteId,
		})
		expect(database.rows('FieldFilterNote')[0]?.isDeleted).toBe(true)
	})
})
