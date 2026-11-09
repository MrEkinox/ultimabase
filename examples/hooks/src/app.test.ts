// The hooks at work, each test on a new in-memory database. Its short regions
// are shown on the page, as is the request it sends (D-282).
import { asUser, testApplication } from '@ultimabase/testing'
import { master, transaction } from 'ultimabase'
import { beforeEach, expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { Board, Card } from './cards.ts'
import { Activity, Call, Comment, Ticket } from './models.ts'
import { outbox } from './outbox.ts'
import { Tag } from './tag.ts'

const { check } = requestFiles(
	new URL('requests/', import.meta.url),
	testApplication(app),
)

const as = { as: master }

beforeEach(() => {
	outbox.length = 0
})

it('changes a tag before it is written', async () => {
	const tag = await Tag.create({ data: { label: ' Urgent ' } }, as)
	expect(tag.label).toBe('urgent')
})

it('changes the data before it is written', async () => {
	//#region before
	const ticket = await Ticket.create({ data: { title: '  Printer jam ' } }, as)
	expect(ticket.title).toBe('Printer jam')

	const closed = await Ticket.update(
		{ where: { id: ticket.id }, data: { status: 'closed' } },
		as,
	)
	expect(closed.closedAt).toBeInstanceOf(Date)
	//#endregion
})

it('refuses a write by throwing', async () => {
	//#region refuse
	const ticket = await Ticket.create({ data: { title: 'Printer jam' } }, as)
	await expect(
		Ticket.delete({ where: { id: ticket.id } }, as),
	).rejects.toMatchObject({
		code: 'TICKET_OPEN',
		message: 'Close the ticket first.',
	})
	expect(await Ticket.count({}, as)).toBe(1)
	//#endregion
})

it('hides rows from every caller', async () => {
	//#region find
	await Ticket.create({ data: { title: 'Printer jam' } }, as)
	await Ticket.create({ data: { title: 'Cheap watches', spam: true } }, as)
	// Master included: a hook is the model's own code.
	const titles = await Ticket.findMany({ select: { title: true } }, as)
	expect(titles).toEqual([{ title: 'Printer jam' }])
	//#endregion
})

it('writes more in the same transaction', async () => {
	//#region after
	const ticket = await Ticket.create({ data: { title: 'Printer jam' } }, as)
	await Ticket.update(
		{ where: { id: ticket.id }, data: { status: 'closed' } },
		as,
	)
	const activity = await Activity.findMany(
		{ where: { ticket: { is: { id: ticket.id } } }, select: { text: true } },
		as,
	)
	expect(activity).toEqual([{ text: 'open → closed' }])
	//#endregion
})

it('acts once the transaction commits', async () => {
	const ticket = await Ticket.create({ data: { title: 'Printer jam' } }, as)
	//#region rollback
	await expect(
		transaction(async () => {
			await Ticket.update(
				{ where: { id: ticket.id }, data: { status: 'closed' } },
				as,
			)
			throw new Error('Something else failed.')
		}),
	).rejects.toThrow('Something else failed.')
	expect(outbox).toEqual([])
	expect(await Ticket.count({ where: { status: 'open' } }, as)).toBe(1)
	//#endregion

	//#region commit
	await Ticket.update(
		{ where: { id: ticket.id }, data: { status: 'closed' } },
		as,
	)
	expect(outbox).toEqual(['Your ticket "Printer jam" is closed.'])
	//#endregion
})

it('refuses an open ticket over GraphQL', async () => {
	const { id } = await Ticket.create({ data: { title: 'Printer jam' } }, as)
	await check('delete-open', { id })
})

it('limits the comments each person posts a minute', async () => {
	//#region limit
	const ada = { as: asUser({ id: 'ada' }) }
	for (const text of ['1', '2', '3', '4', '5']) {
		await Comment.create({ data: { text } }, ada)
	}
	await expect(
		Comment.create({ data: { text: '6' } }, ada),
	).rejects.toMatchObject({
		code: 'TOO_MANY_ATTEMPTS',
		details: { retryAfter: 60 },
	})
	//#endregion
	// Each person's comments count apart.
	const grace = { as: asUser({ id: 'grace' }) }
	const comment = await Comment.create({ data: { text: '1' } }, grace)
	expect(comment.authorId).toBe('grace')
})

it('refuses a row whose fields disagree, and undoes the write', async () => {
	await expect(
		Call.create({ data: { endedAt: new Date() } }, as),
	).rejects.toMatchObject({ code: 'CALL_ENDING' })

	const call = await Call.create({ data: {} }, as)
	await expect(
		Call.update({ where: { id: call.id }, data: { endReason: 'done' } }, as),
	).rejects.toMatchObject({ code: 'CALL_ENDING' })
	const unchanged = await Call.findUniqueOrThrow({ where: { id: call.id } }, as)
	expect(unchanged.endReason).toBeNull()
})

it('accepts a row whose fields agree', async () => {
	const call = await Call.create({ data: {} }, as)
	//#region row-rule
	// The update gives one field; the hook reads both on the row.
	await expect(
		Call.update({ where: { id: call.id }, data: { endReason: 'done' } }, as),
	).rejects.toMatchObject({ code: 'CALL_ENDING' })
	const ended = await Call.update(
		{
			where: { id: call.id },
			data: { endedAt: new Date(), endReason: 'done' },
		},
		as,
	)
	expect(ended.endReason).toBe('done')
	//#endregion
})

it('numbers the cards created together', async () => {
	const board = await Board.create({ data: { name: 'Sprint' } }, as)
	//#region cards
	const where = { id: board.id }
	const create = [{ title: 'a' }, { title: 'b' }]
	await Board.update({ where, data: { cards: { create } } }, as)
	await Card.create({ data: { board: { connect: where }, title: 'c' } }, as)
	const cards = await Card.findMany({ orderBy: { position: 'asc' } }, as)
	expect(cards.map((card) => [card.title, card.position])).toEqual([
		['a', 0],
		['b', 1],
		['c', 2],
	])
	//#endregion
})
