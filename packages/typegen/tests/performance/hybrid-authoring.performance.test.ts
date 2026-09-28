import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const executeFile = promisify(execFile)
const fixtureDirectory = path.join(import.meta.dirname, 'fixtures')
const probes = {
	current: path.join(fixtureDirectory, 'current-typegen-authoring-probe.mjs'),
	hybrid: path.join(fixtureDirectory, 'hybrid-authoring-probe.mjs'),
} as const
const schemaCounts = [1, 10, 50] as const
const sampleCount = 2

interface AuthoringMeasurement {
	readonly coldDiagnosticCount: number
	readonly coldTypecheckDurationMs: number
	readonly completionLatencyMs: number
	readonly completionNames: readonly string[]
	readonly declarationBytes: number
	readonly diagnosticCount: number
	readonly diagnosticLatencyMs: number
	readonly editDiagnosticCount: number
	readonly editToDiagnosticLatencyMs: number
	readonly generationDurationMs: number
	readonly hoverLatencyMs: number
	readonly hoverOutput: string
	readonly languageServiceInitializationMs: number
	readonly peakHeapMiB: number
	readonly scenario: 'current-typegen' | 'hybrid'
	readonly schemaCount: number
}

interface AuthoringSummary {
	readonly coldTypecheckDurationMs: number
	readonly completionLatencyMs: number
	readonly declarationBytes: number
	readonly diagnosticLatencyMs: number
	readonly editToDiagnosticLatencyMs: number
	readonly generationDurationMs: number
	readonly hoverLatencyMs: number
	readonly languageServiceInitializationMs: number
	readonly peakHeapMiB: number
}

const measure = async (
	form: keyof typeof probes,
	schemaCount: number,
): Promise<AuthoringMeasurement> => {
	const { stdout } = await executeFile(
		process.execPath,
		['--expose-gc', probes[form], String(schemaCount)],
		{ maxBuffer: 1024 * 1024 },
	)
	const parsed: unknown = JSON.parse(stdout)

	if (typeof parsed !== 'object' || parsed === null) {
		throw new TypeError('Expected an authoring benchmark measurement')
	}

	return parsed as AuthoringMeasurement
}

const median = (values: readonly number[]): number => {
	const ordered = [...values].sort((left, right) => left - right)
	const rightIndex = Math.floor(ordered.length / 2)
	const right = ordered[rightIndex]

	if (right === undefined) throw new TypeError('Expected benchmark samples')
	if (ordered.length % 2 === 1) return right
	const left = ordered[rightIndex - 1]
	if (left === undefined)
		throw new TypeError('Expected paired benchmark samples')
	return (left + right) / 2
}

const summarize = (
	measurements: readonly AuthoringMeasurement[],
): AuthoringSummary => ({
	coldTypecheckDurationMs: median(
		measurements.map(({ coldTypecheckDurationMs }) => coldTypecheckDurationMs),
	),
	completionLatencyMs: median(
		measurements.map(({ completionLatencyMs }) => completionLatencyMs),
	),
	declarationBytes: median(
		measurements.map(({ declarationBytes }) => declarationBytes),
	),
	diagnosticLatencyMs: median(
		measurements.map(({ diagnosticLatencyMs }) => diagnosticLatencyMs),
	),
	editToDiagnosticLatencyMs: median(
		measurements.map(
			({ editToDiagnosticLatencyMs }) => editToDiagnosticLatencyMs,
		),
	),
	generationDurationMs: median(
		measurements.map(({ generationDurationMs }) => generationDurationMs),
	),
	hoverLatencyMs: median(
		measurements.map(({ hoverLatencyMs }) => hoverLatencyMs),
	),
	languageServiceInitializationMs: median(
		measurements.map(
			({ languageServiceInitializationMs }) => languageServiceInitializationMs,
		),
	),
	peakHeapMiB: median(measurements.map(({ peakHeapMiB }) => peakHeapMiB)),
})

describe('hybrid source-plugin authoring performance', () => {
	it('stays within compiler and editor budgets at 1, 10, and 50 schemas', async () => {
		const raw: Record<
			string,
			Readonly<{
				readonly current: readonly AuthoringMeasurement[]
				readonly hybrid: readonly AuthoringMeasurement[]
			}>
		> = {}
		const summaries: Record<
			string,
			Readonly<{
				readonly current: AuthoringSummary
				readonly hybrid: AuthoringSummary
			}>
		> = {}

		for (const schemaCount of schemaCounts) {
			const current: AuthoringMeasurement[] = []
			const hybrid: AuthoringMeasurement[] = []

			for (let sample = 0; sample < sampleCount; sample += 1) {
				current.push(await measure('current', schemaCount))
				hybrid.push(await measure('hybrid', schemaCount))
			}

			for (const measurement of [...current, ...hybrid]) {
				expect(measurement.coldDiagnosticCount).toBe(0)
				expect(measurement.diagnosticCount).toBe(0)
				expect(measurement.editDiagnosticCount).toBe(1)
				expect(measurement.completionNames).toEqual(
					expect.arrayContaining(['field0', 'field11', 'id', 'related']),
				)
				expect(measurement.hoverOutput.length).toBeLessThan(2_000)
			}

			const currentSummary = summarize(current)
			const hybridSummary = summarize(hybrid)
			raw[String(schemaCount)] = { current, hybrid }
			summaries[String(schemaCount)] = {
				current: currentSummary,
				hybrid: hybridSummary,
			}

			expect(hybridSummary.coldTypecheckDurationMs).toBeLessThanOrEqual(
				currentSummary.coldTypecheckDurationMs * 1.1,
			)
			expect(hybridSummary.languageServiceInitializationMs).toBeLessThanOrEqual(
				currentSummary.languageServiceInitializationMs * 1.1,
			)
			expect(hybridSummary.peakHeapMiB).toBeLessThanOrEqual(
				currentSummary.peakHeapMiB * 1.15,
			)
			expect(hybridSummary.declarationBytes).toBeLessThanOrEqual(
				currentSummary.declarationBytes,
			)
			expect(hybridSummary.editToDiagnosticLatencyMs).toBeLessThanOrEqual(
				currentSummary.editToDiagnosticLatencyMs * 1.1,
			)
			expect(hybridSummary.generationDurationMs).toBeLessThanOrEqual(
				Math.max(
					currentSummary.generationDurationMs * 1.15,
					currentSummary.generationDurationMs + 15,
				),
			)

			// Sub-5 ms samples are beneath a stable relative timing resolution;
			// the absolute floor prevents timer noise from creating flaky ratios.
			for (const [hybridLatency, currentLatency] of [
				[hybridSummary.completionLatencyMs, currentSummary.completionLatencyMs],
				[hybridSummary.hoverLatencyMs, currentSummary.hoverLatencyMs],
				[hybridSummary.diagnosticLatencyMs, currentSummary.diagnosticLatencyMs],
			] as const) {
				expect(hybridLatency).toBeLessThan(500)
				expect(hybridLatency).toBeLessThanOrEqual(
					Math.max(5, currentLatency * 1.15),
				)
			}
		}

		console.info(JSON.stringify({ raw, summaries }, undefined, 2))
	}, 120_000)
})
