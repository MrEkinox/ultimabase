// `defineJob` and `jobsPlugin` (D-221): one form per job, checked at import,
// and each job once in the plugin's jobs; their types follow the form.
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { defineApp, memory } from 'ultimabase'
import { quietRuns } from 'ultimabase/internal'
import type { EnqueueOptions, Job, RecurringJob } from './index.ts'
import { defineJob, jobsPlugin } from './index.ts'

const run = () => undefined

/** `defineJob` called with a value its types refuse. */
const refused = (definition: unknown) => (): unknown => {
	const job: unknown = Reflect.apply(defineJob, undefined, [definition])
	return job
}

/** Starts, then stops, an application whose jobsPlugin takes `jobs`. */
const started = async (jobs: unknown) => {
	const runs = quietRuns(
		defineApp({
			database: memory(),
			models: [],
			// @ts-expect-error: jobsPlugin checks its jobs at start.
			plugins: [jobsPlugin({ jobs })],
		}),
	)
	if (runs === undefined) throw new Error('No runs.')
	const running = runs.on(memory())
	await running.start()
	await running.stop()
}

describe('defineJob', () => {
	it('types a job by its form', () => {
		const withInput = defineJob({
			name: 'closeRoom',
			input: z.object({ room: z.string() }),
			run: ({ input, id }) => {
				expectTypeOf(input).toEqualTypeOf<{ room: string }>()
				expectTypeOf(id).toEqualTypeOf<string>()
			},
		})
		expectTypeOf(withInput).toEqualTypeOf<Job<'closeRoom', { room: string }>>()
		expectTypeOf(withInput.enqueue).parameters.toEqualTypeOf<
			[input: { room: string }, options?: EnqueueOptions]
		>()

		const plain = defineJob({ name: 'sweep', run })
		expectTypeOf(plain.enqueue).parameters.toEqualTypeOf<
			[options?: EnqueueOptions]
		>()

		const every = defineJob({ name: 'hourly', every: 1000, run })
		expectTypeOf(every).toEqualTypeOf<RecurringJob<'hourly'>>()
		// @ts-expect-error: a recurring job is never enqueued.
		expect(every.enqueue).toBeUndefined()

		const both = () =>
			// @ts-expect-error: a job takes one of input, every and cron.
			defineJob({ name: 'both', every: 1000, cron: '* * * * *', run })
		expect(both).toThrow('both: a job takes one of input, every and cron.')

		const zoned = () =>
			// @ts-expect-error: timeZone goes with cron.
			defineJob({ name: 'zoned', every: 1000, timeZone: 'UTC', run })
		expect(zoned).toThrow('zoned: timeZone goes with cron.')

		const keyed = defineJob({
			name: 'sync',
			input: z.object({ account: z.string() }),
			key: (input) => {
				expectTypeOf(input).toEqualTypeOf<{ account: string }>()
				return input.account
			},
			run,
		})
		expectTypeOf(keyed).toEqualTypeOf<Job<'sync', { account: string }>>()
		const recurring = () =>
			// @ts-expect-error: a recurring job takes no key (D-365).
			defineJob({ name: 'nightly', every: 1000, key: () => 'all', run })
		expect(recurring).toThrow('nightly: a recurring job takes no key.')
	})

	it('refuses a definition it cannot run', () => {
		expect(refused({ name: '', run })).toThrow(
			'defineJob: name is a non-empty string.',
		)
		expect(refused({ name: 'nothing' })).toThrow('nothing: run is a function.')
		expect(refused({ name: 'keyed', key: 'all', run })).toThrow(
			'keyed: key is a function.',
		)
		expect(refused({ name: 'schema', input: {}, run })).toThrow(
			'schema: input is a Standard Schema.',
		)
		// 1e300 and the year 10000 are past what a date stores (D-352).
		vi.useFakeTimers({ toFake: ['Date'] })
		const last = Date.UTC(10_000, 0, 1) - Date.now()
		for (const every of [0, -1, Number.NaN, '1 hour', '1000', 1e300, last]) {
			expect(refused({ name: 'every', every, run })).toThrow(
				'every: every is a positive number of milliseconds, ending before the year 10000.',
			)
		}
		expect(refused({ name: 'every', every: last - 1, run })).not.toThrow()
		vi.useRealTimers()
		expect(refused({ name: 'cron', cron: 5, run })).toThrow(
			'cron: cron is a pattern of five fields.',
		)
		expect(
			refused({ name: 'cron', cron: '0 3 * * *', timeZone: 1, run }),
		).toThrow('cron: timeZone is an IANA time zone.')
		// Six fields, a pattern with seconds, are not cron's five.
		expect(refused({ name: 'cron', cron: '0 0 3 * * *', run })).toThrow(
			/^cron: /,
		)
		expect(refused({ name: 'cron', cron: '61 * * * *', run })).toThrow(
			/^cron: /,
		)
		// 30 February (D-352); 29 February runs every four years.
		expect(refused({ name: 'cron', cron: '0 0 30 2 *', run })).toThrow(
			'cron: cron "0 0 30 2 *" never runs.',
		)
		expect(refused({ name: 'cron', cron: '0 0 29 2 *', run })).not.toThrow()
		expect(
			refused({
				name: 'cron',
				cron: '0 3 * * *',
				timeZone: 'Mars/Olympus',
				run,
			}),
		).toThrow(/^cron: /)
	})
})

describe('jobsPlugin', () => {
	it('refuses jobs that are not defineJob values, or a name twice', async () => {
		const sweep = defineJob({ name: 'sweep', run })
		const again = defineJob({ name: 'sweep', every: 1000, run })
		await expect(started(sweep)).rejects.toThrow(
			'jobsPlugin’s jobs is an array of defineJob values.',
		)
		await expect(started([{ name: 'sweep', run }])).rejects.toThrow(
			'jobsPlugin’s jobs is an array of defineJob values.',
		)
		await expect(started([sweep, again])).rejects.toThrow(
			'jobsPlugin’s jobs name sweep twice.',
		)
		await expect(started([sweep])).resolves.toBeUndefined()
	})
})
