import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'

import { UltimaBase } from '@ultimabase/core'

import {
	DeterministicDatabaseAdapter,
	deterministicDatabasePlugin,
} from '../../tests/performance/fixtures/deterministic-database.js'

interface RuntimeSample {
	readonly heapAfterRequests: number
	readonly heapAfterStartup: number
	readonly heapBefore: number
	readonly mutationMs: number
	readonly readMs: number
	readonly startupMs: number
}

type NumericSampleKey = keyof RuntimeSample

const iterations = 20
const workspaceRoot = process.cwd()
const MeasuredPost = UltimaBase.Schema.define({
	className: 'ArchitectureBaselinePost',
	fields: (field) => ({ title: field.string() }),
})

const measure = async (): Promise<RuntimeSample> => {
	globalThis.gc?.()
	const heapBefore = process.memoryUsage().heapUsed
	const adapter = new DeterministicDatabaseAdapter()
	const ultimabase = new (UltimaBase.use(deterministicDatabasePlugin(adapter)))(
		{ logger: false, schemas: [MeasuredPost] },
	)

	try {
		const startupStart = performance.now()
		await ultimabase.start()
		const startupMs = performance.now() - startupStart
		const heapAfterStartup = process.memoryUsage().heapUsed

		const readStart = performance.now()
		await MeasuredPost.findMany()
		const readMs = performance.now() - readStart

		const mutationStart = performance.now()
		await MeasuredPost.createOne({ data: { title: 'Measured mutation' } })
		const mutationMs = performance.now() - mutationStart

		return {
			heapAfterRequests: process.memoryUsage().heapUsed,
			heapAfterStartup,
			heapBefore,
			mutationMs,
			readMs,
			startupMs,
		}
	} finally {
		await ultimabase.dispose()
	}
}

const samples: RuntimeSample[] = []
for (let index = 0; index < iterations; index += 1) {
	samples.push(await measure())
}

const median = (key: NumericSampleKey): number => {
	const ordered = samples.map((sample) => sample[key]).sort((a, b) => a - b)
	return ordered[Math.floor(ordered.length / 2)] ?? 0
}

const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
	cwd: workspaceRoot,
	encoding: 'utf8',
}).trim()

process.stdout.write(
	`${JSON.stringify(
		{
			revision,
			iterations,
			definitions: {
				timing: 'median wall-clock milliseconds across sequential samples',
				heap: 'median process.memoryUsage().heapUsed bytes at each sample point',
				scenario:
					'one no-product application with a deterministic in-memory adapter, one read, one mutation, and disposal',
			},
			median: {
				startupMs: median('startupMs'),
				readMs: median('readMs'),
				mutationMs: median('mutationMs'),
				heapBefore: median('heapBefore'),
				heapAfterStartup: median('heapAfterStartup'),
				heapAfterRequests: median('heapAfterRequests'),
			},
		},
		null,
		2,
	)}\n`,
)
