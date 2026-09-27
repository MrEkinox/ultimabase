import * as ts from 'typescript'

export interface LanguageServiceFixture {
	readonly positionOf: (marker: string) => number
	readonly service: ts.LanguageService
}

/** Creates a TypeScript service with the same strict module settings used by editors. */
export const createLanguageService = (
	fileName: string,
	source: string,
): ts.LanguageService => {
	const host: ts.LanguageServiceHost = {
		fileExists: (requestedFileName) => ts.sys.fileExists(requestedFileName),
		getCompilationSettings: () => ({
			exactOptionalPropertyTypes: true,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			strict: true,
			target: ts.ScriptTarget.ESNext,
		}),
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
		getScriptVersion: () => '0',
		readFile: (requestedFileName) => ts.sys.readFile(requestedFileName),
	}

	return ts.createLanguageService(host)
}

/**
 * Builds one editor program for every marked request in a compatible source.
 * Marker replacement preserves offsets while keeping comments out of the
 * completion and QuickInfo context seen by TypeScript.
 */
export const createLanguageServiceFixture = (
	fileName: string,
	sourceWithMarkers: string,
	markers: readonly string[],
): LanguageServiceFixture => {
	const positions = new Map<string, number>()
	let source = sourceWithMarkers

	for (const marker of markers) {
		const position = source.indexOf(marker)

		if (position < 0) {
			throw new TypeError(
				`Missing TypeScript language-service marker: ${marker}`,
			)
		}

		if (source.includes(marker, position + marker.length)) {
			throw new TypeError(
				`Duplicate TypeScript language-service marker: ${marker}`,
			)
		}

		positions.set(marker, position)
		source = source.replace(marker, ' '.repeat(marker.length))
	}

	return {
		positionOf: (marker) => {
			const position = positions.get(marker)

			if (position === undefined) {
				throw new TypeError(
					`Unknown TypeScript language-service marker: ${marker}`,
				)
			}

			return position
		},
		service: createLanguageService(fileName, source),
	}
}

/** Reads QuickInfo at a source marker without coupling tests to line offsets. */
export const readMarkedQuickInfo = (
	fileName: string,
	sourceWithMarker: string,
	marker = '/* hover */',
): ts.QuickInfo => {
	const markerPosition = sourceWithMarker.indexOf(marker)

	if (markerPosition < 0) {
		throw new TypeError(`Missing TypeScript QuickInfo marker: ${marker}`)
	}

	const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
	const service = createLanguageService(fileName, source)
	const quickInfo = service.getQuickInfoAtPosition(
		fileName,
		markerPosition + marker.length,
	)

	if (quickInfo === undefined) {
		throw new TypeError('Expected TypeScript QuickInfo at the marked position')
	}

	return quickInfo
}
