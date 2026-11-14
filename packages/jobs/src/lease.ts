// A run's lease (D-221 point 7): an instance holds a row five minutes, and
// renews it every third of that while its run runs.
import type { RecordOf } from 'ultimabase'
import { JobsRun, M } from './model.ts'
import type { Running } from './state.ts'

/** Five minutes, an instance's hold on a row. */
export const lease: number = 5 * 60 * 1000
/** A third of the lease, between two renewals of a running row's. */
const renewEvery = lease / 3

type Row = RecordOf<typeof JobsRun>

/**
 * Holds the row while its run runs: renews its lease every third of it, and
 * warns each lease the run lasts. Its end gives the lease last renewed.
 */
export function hold(app: Running, row: Row, held: Date): () => Promise<Date> {
	const facts = { job: row.job, run: row.id }
	let lasting = held
	let renewals = 0
	let renewing = Promise.resolve()
	const renew = async () => {
		const next = new Date(Date.now() + lease)
		const where = { id: row.id, lockedUntil: lasting }
		const data = { lockedUntil: next }
		const { count } = await JobsRun.updateMany({ where, data }, M)
		if (count === 1) lasting = next
	}
	const timer = setInterval(() => {
		renewals += 1
		if (renewals % 3 === 0) {
			const minutes = (renewals * renewEvery) / 60_000
			app.logger.warn(facts, `The job ${row.job} has run ${minutes} minutes.`)
		}
		renewing = renewing.then(renew).catch((error: unknown) => {
			const message = `The job ${row.job} could not renew its lease.`
			app.logger.warn({ ...facts, err: error }, message)
		})
	}, renewEvery)
	timer.unref()
	return async () => {
		clearInterval(timer)
		await renewing
		return lasting
	}
}
