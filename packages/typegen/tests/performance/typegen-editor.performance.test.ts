import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/typegen-editor-probe.mjs',
)

interface TypegenEditorMeasurement {
	readonly completionLatencyMs: number
	readonly completionNames: readonly string[]
	readonly diagnosticCount: number
	readonly diagnosticMessages: readonly string[]
	readonly heapUsedMiB: number
	readonly hoverLatencyMs: number
	readonly hoverOutput: string
	readonly rssMiB: number
	readonly scalarFieldCount: number
	readonly scenario: 'generated' | 'recursive'
	readonly schemaCount: number
	readonly typecheckDurationMs: number
}

interface TypegenEditorSummary {
	readonly completionLatencyMs: number
	readonly heapUsedMiB: number
	readonly hoverLatencyMs: number
	readonly hoverOutput: string
	readonly rssMiB: number
	readonly samples: number
	readonly scenario: TypegenEditorMeasurement['scenario']
	readonly typecheckDurationMs: number
}

const measureScenario = async (
	scenario: TypegenEditorMeasurement['scenario'],
): Promise<TypegenEditorMeasurement> => {
	const { stdout } = await executeFile(
		process.execPath,
		['--expose-gc', fixturePath, scenario],
		{ maxBuffer: 1024 * 1024 },
	)
	const output: unknown = JSON.parse(stdout)

	if (typeof output !== 'object' || output === null) {
		throw new TypeError('Expected an editor measurement object')
	}

	return output as TypegenEditorMeasurement
}

const median = (values: readonly number[]): number => {
	const ordered = [...values].sort((left, right) => left - right)
	const value = ordered[Math.floor(ordered.length / 2)]

	if (value === undefined) throw new TypeError('Expected a measurement sample')
	return value
}

const summarize = (
	measurements: readonly TypegenEditorMeasurement[],
): TypegenEditorSummary => {
	const first = measurements[0]

	if (first === undefined) throw new TypeError('Expected editor measurements')
	return {
		completionLatencyMs: median(
			measurements.map(({ completionLatencyMs }) => completionLatencyMs),
		),
		heapUsedMiB: median(measurements.map(({ heapUsedMiB }) => heapUsedMiB)),
		hoverLatencyMs: median(
			measurements.map(({ hoverLatencyMs }) => hoverLatencyMs),
		),
		hoverOutput: first.hoverOutput,
		rssMiB: median(measurements.map(({ rssMiB }) => rssMiB)),
		samples: measurements.length,
		scenario: first.scenario,
		typecheckDurationMs: median(
			measurements.map(({ typecheckDurationMs }) => typecheckDurationMs),
		),
	}
}

describe('large-schema Typegen editor measurements', () => {
	it('records isolated recursive and generated contract observations', async () => {
		const recursiveMeasurements: TypegenEditorMeasurement[] = []
		const generatedMeasurements: TypegenEditorMeasurement[] = []

		for (let sample = 0; sample < 5; sample += 1) {
			recursiveMeasurements.push(await measureScenario('recursive'))
			generatedMeasurements.push(await measureScenario('generated'))
		}

		for (const measurement of [
			...recursiveMeasurements,
			...generatedMeasurements,
		]) {
			expect(measurement).toMatchObject({
				diagnosticCount: 0,
				scalarFieldCount: 12,
				schemaCount: 48,
			})
			expect(measurement.completionNames).toEqual(
				expect.arrayContaining(['field0', 'field11', 'id']),
			)
			expect(measurement.typecheckDurationMs).toBeGreaterThan(0)
			expect(measurement.completionLatencyMs).toBeGreaterThanOrEqual(0)
			expect(measurement.hoverLatencyMs).toBeGreaterThanOrEqual(0)
			expect(measurement.heapUsedMiB).toBeGreaterThan(0)
			expect(measurement.rssMiB).toBeGreaterThan(0)
			expect(measurement.hoverOutput).toContain('Schema0')
		}
		const recursive = summarize(recursiveMeasurements)
		const generated = summarize(generatedMeasurements)

		expect(generated.hoverOutput).toContain('Schema0Item')
		expect(generated.hoverOutput.length).toBeLessThan(1_000)

		// Timings and process memory are observations, not machine-independent
		// budgets. Printing both isolated scenarios keeps regressions inspectable.
		console.info(JSON.stringify({ generated, recursive }, undefined, 2))
	}, 30_000)
})
