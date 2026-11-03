// `defineJob` and `jobsPlugin` (D-221): one form per job, checked at import,
// and each job once in the plugin's jobs; their types follow the form.
import { describe, expect, expectTypeOf, it } from 'vitest'
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
	})

	it('refuses a definition it cannot run', () => {
		expect(refused({ name: '', run })).toThrow(
			'defineJob: name is a non-empty string.',
		)
		expect(refused({ name: 'nothing' })).toThrow('nothing: run is a function.')
		expect(refused({ name: 'schema', input: {}, run })).toThrow(
			'schema: input is a Standard Schema.',
		)
		for (const every of [0, -1, Number.POSITIVE_INFINITY, '1 hour']) {
			expect(refused({ name: 'every', every, run })).toThrow(
				'every: every is a positive number of milliseconds.',
			)
		}
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
