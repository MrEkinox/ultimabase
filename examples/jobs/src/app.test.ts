// Runs the jobs as the servers would, each test on a new in-memory database
// and a clock the test moves.
import { runJobs, testApplication } from '@ultimabase/testing'
import { master, transaction } from 'ultimabase'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from './app.ts'
import { Call } from './models.ts'
import { closedRooms, outbox } from './services.ts'

const minute = 60 * 1000
const day = 24 * 60 * minute
/** The date `days` days ago. */
const ended = (days: number) => new Date(Date.now() - days * day)

//#region clock
// Before the application starts: its recurring jobs are due from now.
beforeEach(() => {
	// Fakes the date alone, so the timers still run.
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(new Date('2027-01-04T08:00:00Z'))
})
afterEach(() => {
	vi.useRealTimers()
})

testApplication(app)
//#endregion

beforeEach(() => {
	closedRooms.length = 0
	outbox.length = 0
})

it('closes the room ten minutes after the call ends', async () => {
	//#region run
	const call = await Call.create({ data: { room: 'standup' } }, { as: master })
	await Call.update(
		{ where: { id: call.id }, data: { endedAt: new Date() } },
		{ as: master },
	)
	// Runs what is due now, and what those runs enqueue: nothing yet.
	await runJobs()
	expect(closedRooms).toEqual([])

	vi.setSystemTime(Date.now() + 10 * minute)
	await runJobs()
	expect(closedRooms).toEqual(['standup'])
	//#endregion
})

it('enqueues no run when the update rolls back', async () => {
	const call = await Call.create({ data: { room: 'standup' } }, { as: master })
	await expect(
		transaction(async () => {
			await Call.update(
				{ where: { id: call.id }, data: { endedAt: new Date() } },
				{ as: master },
			)
			throw new Error('Cancelled.')
		}),
	).rejects.toThrow('Cancelled.')
	vi.setSystemTime(Date.now() + 10 * minute)
	await runJobs()
	expect(closedRooms).toEqual([])
})

it('purges the calls ended 30 days ago, every hour', async () => {
	await Call.create(
		{ data: { room: 'old', endedAt: ended(31) } },
		{ as: master },
	)
	await Call.create(
		{ data: { room: 'recent', endedAt: ended(1) } },
		{ as: master },
	)
	vi.setSystemTime(Date.now() + 60 * minute)
	await runJobs()
	const left = await Call.findMany({ select: { room: true } }, { as: master })
	expect(left).toEqual([{ room: 'recent' }])
})

it('sends a report at 3:00 in Paris', async () => {
	//#region recurring
	await Call.create(
		{ data: { room: 'standup', endedAt: new Date() } },
		{ as: master },
	)
	// 3:00 in Paris, in winter.
	vi.setSystemTime(new Date('2027-01-05T02:00:00Z'))
	await runJobs()
	expect(outbox).toEqual(['Calls ended yesterday: 1.'])
	//#endregion
})
