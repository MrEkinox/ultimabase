import { readFileSync } from 'node:fs'
import path from 'node:path'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	createLanguageServiceFixture,
	createLanguageServiceWorkspace,
	type LanguageServiceFixture,
} from '../../../tooling/vitest/typescript-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
const fixtureDirectory = path.join(import.meta.dirname, 'performance/fixtures')
const contractPath = path.join(fixtureDirectory, 'hybrid-authoring-contract.ts')
const smokePath = path.join(fixtureDirectory, 'hybrid-authoring-smoke.ts')
const sourceModule = './hybrid-authoring-contract.js'
const packedModule = '@ultimabase/hybrid-authoring-proof'

const markers = [
	'/* field-builder */',
	'/* hover */',
	'/* schema-options */',
	'/* schema-statics */',
	'/* target-where */',
] as const

const markedSmokeSource = (): string =>
	readFileSync(smokePath, 'utf8')
		.replace(
			"author: { is: { email: { ne: 'blocked@example.com' } } },",
			'author: { is: { /* target-where */ } },',
		)
		.replace(
			'embedding: field.vector',
			'embedding: field./* field-builder */vector',
		)
		.replace('export const Post =', 'export const /* hover */Post =')
		.replace(
			'export const Role = Blog.Schema.define({',
			'export const Role = Blog.Schema.define({ /* schema-options */',
		)
		.replace(
			'await Post.softDelete',
			'await Post./* schema-statics */softDelete',
		)

const emitPackedDeclaration = (): string => {
	let declaration: string | undefined
	const program = ts.createProgram({
		options: {
			declaration: true,
			emitDeclarationOnly: true,
			exactOptionalPropertyTypes: true,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			strict: true,
			target: ts.ScriptTarget.ESNext,
		},
		rootNames: [contractPath],
	})
	const diagnostics = ts.getPreEmitDiagnostics(program)
	const result = program.emit(undefined, (fileName, contents) => {
		if (fileName.endsWith('.d.ts')) declaration = contents
	})

	if (diagnostics.length > 0 || result.diagnostics.length > 0) {
		throw new TypeError(
			[...diagnostics, ...result.diagnostics]
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				)
				.join('\n'),
		)
	}
	if (declaration === undefined) {
		throw new TypeError('Expected the hybrid proof declaration emit')
	}

	return declaration
}

interface EditorFixture {
	readonly fileName: string
	readonly fixture: LanguageServiceFixture
}

const createEditorFixture = (mode: 'packed' | 'source'): EditorFixture => {
	const isPacked = mode === 'packed'
	const virtualDirectory = isPacked
		? path.join(fixtureDirectory, '.hybrid-packed')
		: fixtureDirectory
	const fileName = path.join(virtualDirectory, 'application.fixture.ts')
	const packedDeclarationPath = path.join(
		virtualDirectory,
		'hybrid-package.d.ts',
	)
	const moduleSpecifier = isPacked ? packedModule : sourceModule
	const compilerOptions: ts.CompilerOptions = {
		baseUrl: repositoryRoot,
		exactOptionalPropertyTypes: true,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		...(isPacked ? { paths: { [packedModule]: [packedDeclarationPath] } } : {}),
		strict: true,
		target: ts.ScriptTarget.ESNext,
	}
	const workspace = createLanguageServiceWorkspace({
		compilerOptions,
		currentDirectory: repositoryRoot,
	})

	if (isPacked) {
		workspace.addFile(packedDeclarationPath, emitPackedDeclaration())
	}
	const source = markedSmokeSource().replaceAll(sourceModule, moduleSpecifier)
	const fixture = createLanguageServiceFixture(
		fileName,
		source,
		markers,
		workspace,
	)

	return { fileName, fixture }
}

const completionNames = (
	{ fileName, fixture }: EditorFixture,
	marker: (typeof markers)[number],
): readonly string[] =>
	fixture.service
		.getCompletionsAtPosition(fileName, fixture.positionOf(marker), {})
		?.entries.map(({ name }) => name) ?? []

const diagnosticMessages = (fixture: EditorFixture): readonly string[] =>
	fixture.fixture.service
		.getSemanticDiagnostics(fixture.fileName)
		.map(({ messageText }) =>
			ts.flattenDiagnosticMessageText(messageText, '\n'),
		)

describe.each(['source', 'packed'] as const)(
	'hybrid source-plugin authoring through %s contracts',
	(mode) => {
		it('keeps the retained graph and source plugin projections exact', () => {
			const editor = createEditorFixture(mode)
			const fieldBuilderPosition = editor.fixture.positionOf(
				'/* field-builder */',
			)
			const vectorCompletion = editor.fixture.service
				.getCompletionsAtPosition(editor.fileName, fieldBuilderPosition, {})
				?.entries.find(({ name }) => name === 'vector')

			expect(diagnosticMessages(editor)).toStrictEqual([])
			expect(vectorCompletion).toBeDefined()
			if (vectorCompletion === undefined) {
				throw new TypeError('Expected the source-projected vector completion')
			}
			const vectorDetails = editor.fixture.service.getCompletionEntryDetails(
				editor.fileName,
				fieldBuilderPosition,
				vectorCompletion.name,
				undefined,
				vectorCompletion.source,
				undefined,
				vectorCompletion.data,
			)
			expect(ts.displayPartsToString(vectorDetails?.documentation)).toContain(
				'fixed-dimension vector',
			)
			expect(completionNames(editor, '/* schema-options */')).toEqual(
				expect.arrayContaining(['access', 'hooks', 'softDelete']),
			)
			expect(completionNames(editor, '/* schema-statics */')).toContain(
				'softDelete',
			)
			expect(completionNames(editor, '/* target-where */')).toEqual(
				expect.arrayContaining(['AND', 'email', 'posts']),
			)

			const hover = editor.fixture.service.getQuickInfoAtPosition(
				editor.fileName,
				editor.fixture.positionOf('/* hover */') + '/* hover */'.length,
			)
			const display = ts.displayPartsToString(hover?.displayParts)

			expect(display).toContain('DefinedSchema')
			expect(display.length).toBeLessThan(2_000)
		})

		it('rejects plugin surfaces absent from the configured factory', () => {
			const editor = createEditorFixture(mode)
			const invalidFile = path.join(
				path.dirname(editor.fileName),
				'plugin-absence.fixture.ts',
			)
			const moduleSpecifier = mode === 'packed' ? packedModule : sourceModule
			const invalidSource = `
import { UltimaBase } from '${moduleSpecifier}'
const Missing = UltimaBase.Schema.define({
  className: 'MissingPlugins',
  fields: (field) => ({ embedding: field.vector({ dimensions: 3 }) }),
  access: { read: true },
})
Missing.softDelete({ id: 'missing' })
`

			editor.fixture.service.dispose()
			const workspace = createLanguageServiceWorkspace({
				compilerOptions: {
					baseUrl: repositoryRoot,
					exactOptionalPropertyTypes: true,
					module: ts.ModuleKind.NodeNext,
					moduleResolution: ts.ModuleResolutionKind.NodeNext,
					...(mode === 'packed'
						? {
								paths: {
									[packedModule]: [
										path.join(
											path.dirname(editor.fileName),
											'hybrid-package.d.ts',
										),
									],
								},
							}
						: {}),
					strict: true,
					target: ts.ScriptTarget.ESNext,
				},
				currentDirectory: repositoryRoot,
			})
			if (mode === 'packed') {
				workspace.addFile(
					path.join(path.dirname(editor.fileName), 'hybrid-package.d.ts'),
					emitPackedDeclaration(),
				)
			}
			workspace.addFile(invalidFile, invalidSource)
			const messages = workspace.service
				.getSemanticDiagnostics(invalidFile)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				)
				.join('\n')

			expect(messages).toContain("Property 'vector' does not exist")
			expect(messages).toContain("'access' does not exist")
			expect(messages).toContain("Property 'softDelete' does not exist")
			workspace.service.dispose()
		})
	},
)
