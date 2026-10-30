// The hooks at work, each test on a new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { master, transaction } from 'ultimabase'
import { beforeEach, expect, it } from 'vitest'
import { app } from './app.ts'
import { Activity, Ticket } from './models.ts'
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
