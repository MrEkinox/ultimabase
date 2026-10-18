import { testApplication } from '@ultimabase/testing'
import { afterEach, expect, it, vi } from 'vitest'

import { Member, Note, Story } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// Access writes through the application logger, the console by default.
afterEach(() => {
	vi.restoreAllMocks()
})

const accessLines = (spy: { mock: { calls: unknown[][] } }) =>
	spy.mock.calls
		.map(([line]) => line)
		.filter(
			(line): line is string =>
				typeof line === 'string' && line.startsWith('[@ultimabase/access'),
		)

it('warns about each exposed method no Access rule opens', async () => {
	const warn = vi.spyOn(console, 'warn')
	await testApplication(ultimabase)

	// REST serves its default methods; Draft has no rule and no opening, and
	// Story opens no create or delete. Each method Access always refuses is
	// one warn line (production refuses to start instead).
	const lines = accessLines(warn)
	const fix = (method: string) =>
		`no Access rule opens it. Add an Access rule, open it in allowWithoutRule, or close it with expose: { ${method}: false }.`
	expect(lines.filter((line) => line.includes('] Draft.'))).toStrictEqual(
		[
			'findMany',
			'findOne',
			'exists',
			'createOne',
			'updateOne',
			'deleteOne',
		].map(
			(method) =>
				`[@ultimabase/access-plugin] Draft.${method} is exposed but ${fix(method)}`,
		),
	)
	expect(lines.filter((line) => line.includes('] Story.'))).toStrictEqual(
		['createOne', 'deleteOne'].map(
			(method) =>
				`[@ultimabase/access-plugin] Story.${method} is exposed but ${fix(method)}`,
		),
	)
})

it('explains a denial on the server only', async () => {
	await using t = await testApplication(ultimabase)
	const story = await t.asMaster(() =>
		Story.createOne({ data: { published: true, title: 'Live' } }),
	)
	const info = vi.spyOn(console, 'info')

	// The client receives the usual PERMISSION_DENIED; the server log names
	// the schema, operation, step and rule (at debug in production).
	await expect(
		Story.updateOne({ data: { title: 'Renamed' }, where: { id: story.id } }),
	).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	await expect(
		Story.createOne({ data: { title: 'New' } }),
	).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	expect(accessLines(info)).toStrictEqual([
		'[@ultimabase/access-plugin] denied update on Story at the item step (Story.access.update.item).',
		'[@ultimabase/access-plugin] denied create on Story at the operation step (no rule for create, and allowWithoutRule does not open it).',
	])
})

it('answers can() without running the operation', async () => {
	await using t = await testApplication(ultimabase)
	const [ada, grace] = await t.asMaster(() =>
		Member.createMany({ data: [{ name: 'Ada' }, { name: 'Grace' }] }),
	)
	if (!ada || !grace) throw new TypeError('Missing members')
	const note = await t.as(Member.pointer(ada.id), () =>
		Note.createOne({ data: { author: ada.id, body: 'Call the printer' } }),
	)
	const info = vi.spyOn(console, 'info')

	//#region can
	const adaMayEdit = await ultimabase.can({
		principal: Member.pointer(ada.id),
		operation: 'update',
		schema: Note,
		item: { id: note.id },
	})
	const graceMayEdit = await ultimabase.can({
		principal: Member.pointer(grace.id),
		operation: 'update',
		schema: Note,
		item: { id: note.id },
	})
	//#endregion can

	expect(adaMayEdit).toBe(true)
	// Grace cannot read Ada's note: a hidden row answers false.
	expect(graceMayEdit).toBe(false)
	expect(await ultimabase.can({ operation: 'create', schema: Note })).toBe(
		false,
	)
	// can() answers are not logged, and nothing changed.
	expect(accessLines(info)).toStrictEqual([])
	expect(
		await t.asMaster(() => Note.findMany({ select: { body: true } })),
	).toMatchObject([{ body: 'Call the printer' }])
})
