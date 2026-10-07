import { Buffer } from 'node:buffer'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'

import * as ts from 'typescript'

const percentile95 = (values) => {
	const ordered = [...values].sort((left, right) => left - right)
	return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? 0
}
const warmSampleCount = 40

/** Runs one isolated compiler and editor sample for a generated fixture. */
export const runEditorProbe = ({
	completionMarker,
	declarationBytes: measuredDeclarationBytes,
	declarationEndMarker,
	declarationStartMarker,
	editFrom,
	editTo,
	generationDurationMs,
	hoverMarker,
	scalarFieldCount,
	scenario,
	schemaCount,
	sourceWithMarkers,
}) => {
	const completionPosition = sourceWithMarkers.indexOf(completionMarker)
	const hoverPosition = sourceWithMarkers.indexOf(hoverMarker)
	let source = sourceWithMarkers
		.replace(completionMarker, ' '.repeat(completionMarker.length))
		.replace(hoverMarker, ' '.repeat(hoverMarker.length))
	const fileName = path.resolve(`typegen-editor-${scenario}.fixture.ts`)
	const compilerOptions = {
		exactOptionalPropertyTypes: true,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		strict: true,
		target: ts.ScriptTarget.ESNext,
	}
	const declarationEnd = source.indexOf(declarationEndMarker)
	const declarationStart =
		declarationStartMarker === undefined
			? 0
			: source.indexOf(declarationStartMarker)
	const declarationBytes =
		measuredDeclarationBytes ??
		Buffer.byteLength(
			declarationEnd < 0
				? source.slice(Math.max(0, declarationStart))
				: source.slice(Math.max(0, declarationStart), declarationEnd),
		)
	let peakHeapUsed = process.memoryUsage().heapUsed
	const capturePeakHeap = () => {
		peakHeapUsed = Math.max(peakHeapUsed, process.memoryUsage().heapUsed)
	}

	const coldHost = ts.createCompilerHost(compilerOptions)
	const defaultGetSourceFile = coldHost.getSourceFile.bind(coldHost)
	coldHost.getSourceFile = (requestedFileName, languageVersion, ...rest) =>
		requestedFileName === fileName
			? ts.createSourceFile(fileName, source, languageVersion, true)
			: defaultGetSourceFile(requestedFileName, languageVersion, ...rest)
	const coldTypecheckStartedAt = performance.now()
	const coldProgram = ts.createProgram({
		host: coldHost,
		options: compilerOptions,
		rootNames: [fileName],
	})
	const coldDiagnostics = ts.getPreEmitDiagnostics(coldProgram)
	const coldTypecheckDurationMs = performance.now() - coldTypecheckStartedAt
	capturePeakHeap()

	let scriptVersion = 0
	const host = {
		fileExists: (requestedFileName) => ts.sys.fileExists(requestedFileName),
		getCompilationSettings: () => compilerOptions,
		getCurrentDirectory: () => process.cwd(),
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getScriptFileNames: () => [fileName],
		getScriptSnapshot: (requestedFileName) => {
			const contents =
				requestedFileName === fileName
					? source
					: ts.sys.readFile(requestedFileName)
			return contents === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(contents)
		},
		getScriptVersion: () => String(scriptVersion),
		readFile: (requestedFileName) => ts.sys.readFile(requestedFileName),
	}
	const languageServiceStartedAt = performance.now()
	const service = ts.createLanguageService(host)
	service.getProgram()
	const languageServiceInitializationMs =
		performance.now() - languageServiceStartedAt
	capturePeakHeap()
	const typecheckStartedAt = performance.now()
	const diagnostics = service.getSemanticDiagnostics(fileName)
	const typecheckDurationMs = performance.now() - typecheckStartedAt
	capturePeakHeap()

	const completionSamples = []
	const diagnosticSamples = []
	const hoverSamples = []
	let completionNames =
		service
			.getCompletionsAtPosition(fileName, completionPosition, {})
			?.entries.map(({ name }) => name) ?? []
	let hover = service.getQuickInfoAtPosition(
		fileName,
		hoverPosition + hoverMarker.length,
	)
	service.getSemanticDiagnostics(fileName)
	capturePeakHeap()
	for (let sample = 0; sample < warmSampleCount; sample += 1) {
		const completionStartedAt = performance.now()
		completionNames =
			service
				.getCompletionsAtPosition(fileName, completionPosition, {})
				?.entries.map(({ name }) => name) ?? []
		completionSamples.push(performance.now() - completionStartedAt)

		const hoverStartedAt = performance.now()
		hover = service.getQuickInfoAtPosition(
			fileName,
			hoverPosition + hoverMarker.length,
		)
		hoverSamples.push(performance.now() - hoverStartedAt)

		const diagnosticStartedAt = performance.now()
		service.getSemanticDiagnostics(fileName)
		diagnosticSamples.push(performance.now() - diagnosticStartedAt)
		capturePeakHeap()
	}

	source = source.replace(editFrom, editTo)
	scriptVersion += 1
	const editDiagnosticStartedAt = performance.now()
	const editDiagnostics = service.getSemanticDiagnostics(fileName)
	const editToDiagnosticLatencyMs = performance.now() - editDiagnosticStartedAt
	capturePeakHeap()

	globalThis.gc?.()
	const memory = process.memoryUsage()
	const result = {
		coldDiagnosticCount: coldDiagnostics.length,
		coldTypecheckDurationMs,
		completionLatencyMs: percentile95(completionSamples),
		completionNames,
		declarationBytes,
		diagnosticCount: diagnostics.length,
		diagnosticLatencyMs: percentile95(diagnosticSamples),
		diagnosticMessages: diagnostics.map(({ messageText }) =>
			ts.flattenDiagnosticMessageText(messageText, '\n'),
		),
		editDiagnosticCount: editDiagnostics.length,
		editToDiagnosticLatencyMs,
		generationDurationMs,
		heapUsedMiB: memory.heapUsed / 1024 / 1024,
		hoverLatencyMs: percentile95(hoverSamples),
		hoverOutput: ts.displayPartsToString(hover?.displayParts),
		languageServiceInitializationMs,
		peakHeapMiB: peakHeapUsed / 1024 / 1024,
		rssMiB: memory.rss / 1024 / 1024,
		scalarFieldCount,
		scenario,
		schemaCount,
		typecheckDurationMs,
	}

	service.dispose()
	process.stdout.write(`${JSON.stringify(result)}\n`)
}
