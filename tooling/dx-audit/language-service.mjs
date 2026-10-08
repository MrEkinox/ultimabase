// Editor projects and editor-visible result normalization for the DX audit.
// The same TypeScript installation (the auditing repository's) serves both
// roots, so every difference comes from the audited sources, never the tool.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

/** Same strict editor settings as tooling/vitest/typescript-language-service.ts. */
export const defaultCompilerOptions = {
	exactOptionalPropertyTypes: true,
	module: ts.ModuleKind.NodeNext,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
	strict: true,
	target: ts.ScriptTarget.ESNext,
}

/**
 * Per-root state: one document registry shares parsed declaration files
 * between the projects of a root, and absolute root paths become `<root>`.
 */
export const createRootContext = (root) => {
	const absoluteRoot = path.resolve(root)
	const realRoot = fs.realpathSync(absoluteRoot)
	const prefixes = [...new Set([realRoot, absoluteRoot])].sort(
		(left, right) => right.length - left.length,
	)

	return {
		normalize: (text) =>
			prefixes.reduce(
				(result, prefix) => result.replaceAll(prefix, '<root>'),
				text,
			),
		registry: ts.createDocumentRegistry(),
		relative: (fileName) => path.relative(realRoot, fileName),
		root: realRoot,
	}
}

/**
 * Creates a language service over virtual files (fileName -> source) and
 * existing files. Virtual files never touch the disk, so audited roots stay
 * untouched.
 */
export const createProject = (
	context,
	compilerOptions,
	virtualFiles,
	diskFiles = [],
) => {
	const rootNames = [...virtualFiles.keys(), ...diskFiles]
	const readFile = (fileName) =>
		virtualFiles.get(fileName) ?? ts.sys.readFile(fileName)
	const host = {
		directoryExists: ts.sys.directoryExists,
		fileExists: (fileName) =>
			virtualFiles.has(fileName) || ts.sys.fileExists(fileName),
		getCompilationSettings: () => compilerOptions,
		getCurrentDirectory: () => context.root,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getDirectories: ts.sys.getDirectories,
		getScriptFileNames: () => rootNames,
		getScriptSnapshot: (fileName) => {
			const source = readFile(fileName)

			return source === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(source)
		},
		// The shared registry caches by name and version: virtual files are versioned by content.
		getScriptVersion: (fileName) => {
			const source = virtualFiles.get(fileName)

			return source === undefined
				? '0'
				: createHash('sha256').update(source).digest('hex')
		},
		readDirectory: ts.sys.readDirectory,
		readFile,
		realpath: ts.sys.realpath,
	}

	return ts.createLanguageService(host, context.registry)
}

/** Reads compiler options from a tsconfig file of the audited root. */
export const readConfig = (configFile) => {
	const parsed = ts.getParsedCommandLineOfConfigFile(configFile, undefined, {
		...ts.sys,
		onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
			throw new Error(
				ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
			)
		},
	})

	if (parsed === undefined) throw new Error(`Cannot read ${configFile}`)
	return parsed
}

const partsText = (parts) => ts.displayPartsToString(parts ?? [])

/** Everything a hover shows: display line, documentation and JSDoc tags. */
export const quickInfoValue = (context, info) =>
	info === undefined
		? null
		: {
				display: context.normalize(partsText(info.displayParts)),
				documentation: context.normalize(partsText(info.documentation)),
				kind: info.kind,
				kindModifiers: info.kindModifiers,
				tags: (info.tags ?? []).map((tag) =>
					context.normalize(`@${tag.name} ${partsText(tag.text)}`.trimEnd()),
				),
			}

/**
 * Completion lists as editors present them: editors order entries by
 * sortText then name, so the service's internal order is not compared.
 */
export const completionValue = (context, completions) =>
	completions === undefined
		? null
		: {
				entries: completions.entries
					.map((entry) =>
						context.normalize(
							[
								entry.name,
								entry.kind,
								entry.kindModifiers ?? '',
								entry.sortText,
							].join(' | '),
						),
					)
					.sort(),
				isMemberCompletion: completions.isMemberCompletion,
				isNewIdentifierLocation: completions.isNewIdentifierLocation,
			}

const flatten = (messageText) =>
	ts.flattenDiagnosticMessageText(messageText, '\n')

/** Diagnostics keep code, category, full message chain, span text and related information. */
export const diagnosticsValue = (context, diagnostics) =>
	diagnostics
		.map((diagnostic) => {
			const span =
				diagnostic.file === undefined || diagnostic.start === undefined
					? ''
					: diagnostic.file.text.slice(
							diagnostic.start,
							diagnostic.start + (diagnostic.length ?? 0),
						)
			const related = (diagnostic.relatedInformation ?? []).map(
				(information) =>
					`related TS${information.code}: ${flatten(information.messageText)}`,
			)

			return context.normalize(
				[
					`TS${diagnostic.code} ${ts.DiagnosticCategory[diagnostic.category]} at \`${span}\``,
					flatten(diagnostic.messageText),
					...related,
				].join('\n'),
			)
		})
		.sort()

/** Returns `line:column` (1-based) for a position of a source text. */
export const locationOf = (sourceFile, position) => {
	const { character, line } = sourceFile.getLineAndCharacterOfPosition(position)

	return `${line + 1}:${character + 1}`
}
