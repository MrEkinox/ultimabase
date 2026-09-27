import path from 'node:path'

import * as ts from 'typescript'

export interface LanguageServiceFixture {
	readonly positionOf: (marker: string) => number
	readonly service: ts.LanguageService
}

export interface LanguageServiceWorkspace {
	readonly addFile: (fileName: string, source: string) => void
	readonly service: ts.LanguageService
}

export interface LanguageServiceWorkspaceOptions {
	readonly compilerOptions?: ts.CompilerOptions
	readonly currentDirectory?: string
}

const defaultCompilerOptions: ts.CompilerOptions = {
	exactOptionalPropertyTypes: true,
	module: ts.ModuleKind.NodeNext,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
	strict: true,
	target: ts.ScriptTarget.ESNext,
}

/** Creates one incremental TypeScript editor project for compatible files. */
export const createLanguageServiceWorkspace = (
	options: LanguageServiceWorkspaceOptions = {},
): LanguageServiceWorkspace => {
	const files = new Map<
		string,
		{ readonly source: string; readonly version: number }
	>()
	let projectVersion = 0
	const compilerOptions = options.compilerOptions ?? defaultCompilerOptions
	const currentDirectory = options.currentDirectory ?? process.cwd()
	const host: ts.LanguageServiceHost = {
		fileExists: (fileName) =>
			files.has(fileName) || ts.sys.fileExists(fileName),
		getCompilationSettings: () => compilerOptions,
		getCurrentDirectory: () => currentDirectory,
		getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
		getProjectVersion: () => String(projectVersion),
		getScriptFileNames: () => [...files.keys()],
		getScriptSnapshot: (fileName) => {
			const contents = files.get(fileName)?.source ?? ts.sys.readFile(fileName)

			return contents === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(contents)
		},
		getScriptVersion: (fileName) => String(files.get(fileName)?.version ?? 0),
		readFile: (fileName) =>
			files.get(fileName)?.source ?? ts.sys.readFile(fileName),
	}
	const service = ts.createLanguageService(host)

	return {
		addFile: (fileName, source) => {
			const previous = files.get(fileName)

			if (previous?.source === source) return

			files.set(fileName, {
				source,
				version: (previous?.version ?? -1) + 1,
			})
			projectVersion += 1
		},
		service,
	}
}

/** Creates a TypeScript service with the same strict module settings used by editors. */
export const createLanguageService = (
	fileName: string,
	source: string,
): ts.LanguageService => {
	const workspace = createLanguageServiceWorkspace()

	workspace.addFile(fileName, source)
	return workspace.service
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
	workspace = createLanguageServiceWorkspace(),
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

	workspace.addFile(fileName, source)

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
		service: workspace.service,
	}
}

export interface PublicApiLanguageServiceFixture {
	readonly documentationAt: (needle: string) => string
	readonly readExportCompletions: () => readonly string[]
	readonly readRemovedMessages: () => readonly string[]
}

export interface PublicApiLanguageServiceFixtureOptions {
	readonly directory: string
	readonly documentedSource?: string
	readonly moduleSpecifier: string
	readonly removedNames?: readonly string[]
}

/** Builds one editor project for compatible public-surface source checks. */
export const createPublicApiLanguageServiceFixture = ({
	directory,
	documentedSource,
	moduleSpecifier,
	removedNames = [],
}: PublicApiLanguageServiceFixtureOptions): PublicApiLanguageServiceFixture => {
	const marker = '/* exports */'
	const exportsSource = `import { ${marker} } from '${moduleSpecifier}'`
	const exportsFile = path.join(directory, 'public-api-exports.fixture.ts')
	const removedFile = path.join(directory, 'public-api-removed.fixture.ts')
	const documentedFile = path.join(
		directory,
		'public-api-documented.fixture.ts',
	)
	const workspace = createLanguageServiceWorkspace()

	workspace.addFile(exportsFile, exportsSource)
	if (removedNames.length > 0) {
		workspace.addFile(
			removedFile,
			`import { ${removedNames.join(', ')} } from '${moduleSpecifier}'`,
		)
	}
	if (documentedSource !== undefined) {
		workspace.addFile(documentedFile, documentedSource)
	}

	return {
		documentationAt: (needle) => {
			if (documentedSource === undefined) {
				throw new TypeError('This public API fixture has no documented source')
			}

			return (
				workspace.service
					.getQuickInfoAtPosition(
						documentedFile,
						documentedSource.lastIndexOf(needle),
					)
					?.documentation?.map(({ text }) => text)
					.join('') ?? ''
			)
		},
		readExportCompletions: () =>
			workspace.service
				.getCompletionsAtPosition(
					exportsFile,
					exportsSource.indexOf(marker),
					{},
				)
				?.entries.map(({ name }) => name)
				.filter((name) => name !== 'type')
				.sort() ?? [],
		readRemovedMessages: () =>
			workspace.service
				.getSemanticDiagnostics(removedFile)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, ' '),
				),
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
