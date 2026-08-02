import * as ts from 'typescript'

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
