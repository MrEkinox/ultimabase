// The hooks at work, each test on a new in-memory database.
import { asUser, testApplication } from '@ultimabase/testing'
import { master, transaction } from 'ultimabase'
import { beforeEach, expect, it } from 'vitest'
import { app } from './app.ts'
import { Activity, Call, Comment, Ticket } from './models.ts'
import { outbox } from './outbox.ts'

const running = testApplication(app)

const as = { as: master }

beforeEach(() => {
	outbox.length = 0
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
	//#region commit
	const ticket = await Ticket.create({ data: { title: 'Printer jam' } }, as)
	const close = {
		where: { id: ticket.id },
		data: { status: 'closed' },
	} as const

	// The transaction fails after the update: nothing is sent.
	await expect(
		transaction(async () => {
			await Ticket.update(close, as)
			throw new Error('Something else failed.')
		}),
	).rejects.toThrow('Something else failed.')
	expect(outbox).toEqual([])
	expect(await Ticket.count({ where: { status: 'open' } }, as)).toBe(1)

	await Ticket.update(close, as)
	expect(outbox).toEqual(['Your ticket "Printer jam" is closed.'])
	//#endregion
})

it('refuses an open ticket over GraphQL', async () => {
	//#region graphql
	const ticket = await Ticket.create({ data: { title: 'Printer jam' } }, as)
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: 'mutation ($id: ID!) { deleteTicket(where: { id: $id }) { id } }',
			variables: { id: ticket.id },
		}),
	})
	expect(await response.json()).toMatchObject({
		errors: [
			{
				message: 'Close the ticket first.',
				extensions: { code: 'TICKET_OPEN' },
			},
		],
	})
	//#endregion
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
	// Each person's comments count apart.
	const grace = { as: asUser({ id: 'grace' }) }
	const comment = await Comment.create({ data: { text: '1' } }, grace)
	expect(comment.authorId).toBe('grace')
	//#endregion
})

it('refuses a row whose fields disagree', async () => {
	//#region row-rule
	await expect(
		Call.create({ data: { endedAt: new Date() } }, as),
	).rejects.toMatchObject({ code: 'CALL_ENDING' })

	const call = await Call.create({ data: {} }, as)
	// The update gives one field; the hook reads both on the row.
	await expect(
		Call.update({ where: { id: call.id }, data: { endReason: 'done' } }, as),
	).rejects.toMatchObject({ code: 'CALL_ENDING' })
	const unchanged = await Call.findUniqueOrThrow({ where: { id: call.id } }, as)
	expect(unchanged.endReason).toBeNull()

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
