import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
	generateApplicationTypes,
	loadTypegenApplication,
} from '@ultimabase/typegen'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	applicationExample,
	readExample,
	schemaExample,
	writeExample,
} from '../components/landing/content'
import { demoExamples } from '../components/landing/demo-content'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))

describe('landing page examples', () => {
	it('compiles the displayed application and preserves selected result types', async () => {
		const directory = await mkdtemp(
			path.join(repositoryRoot, '.landing-check-'),
		)
		try {
			const filename = path.join(directory, 'landing-example.ts')
			// Compile the displayed excerpts themselves, so copy cannot drift from the API.
			const source = [
				schemaExample,
				applicationExample.replace(
					"import { Article } from './article.js'",
					'',
				),
				readExample,
				writeExample,
				`const title: string = article.title
const selectedTitle: string | undefined = articles[0]?.title
// @ts-expect-error A field excluded by select must not leak into the result type.
articles[0]?.published
// @ts-expect-error The schema requires a string title.
const invalid: number = article.title
void title; void selectedTitle; void invalid;
await app.dispose()`,
			].join('\n\n')
			// Generate the real declaration without starting the application or connecting storage.
			const applicationPath = path.join(directory, 'application.ts')
			await writeFile(
				applicationPath,
				schemaExample +
					'\n' +
					applicationExample
						.replace("import { Article } from './article.js'", '')
						.replace('const app =', 'export const app =')
						.replace(
							'process.env.DATABASE_URL',
							"'postgres://localhost/landing_typecheck'",
						)
						.replace('await app.start()', ''),
			)
			const application = await loadTypegenApplication({
				sourcePath: applicationPath,
				exportName: 'app',
			})
			const generated = generateApplicationTypes({
				application,
				applicationId: 'main',
			})
			const declarationPath = path.join(directory, 'schema.generated.d.ts')
			await writeFile(declarationPath, generated.contents)
			const options: ts.CompilerOptions = {
				module: ts.ModuleKind.NodeNext,
				moduleResolution: ts.ModuleResolutionKind.NodeNext,
				noEmit: true,
				noUncheckedIndexedAccess: true,
				skipLibCheck: true,
				strict: true,
				target: ts.ScriptTarget.ES2024,
				types: ['node'],
			}
			const host = ts.createCompilerHost(options)
			const readSource = host.getSourceFile.bind(host)
			host.getSourceFile = (name, languageVersion, onError, shouldCreate) =>
				name === filename
					? ts.createSourceFile(name, source, languageVersion, true)
					: readSource(name, languageVersion, onError, shouldCreate)
			const program = ts.createProgram(
				[filename, declarationPath],
				options,
				host,
			)
			const diagnostics = ts.getPreEmitDiagnostics(program)
			expect(
				ts.formatDiagnosticsWithColorAndContext(diagnostics, {
					getCanonicalFileName: (name) => name,
					getCurrentDirectory: () => repositoryRoot,
					getNewLine: () => '\n',
				}),
			).toBe('')
			// Read the compiler's inferred model properties, not handwritten substitute types.
			const checker = program.getTypeChecker()
			const compiled = program.getSourceFile(filename)
			if (!compiled) throw new Error('Landing sample was not compiled')
			const declarations = compiled.statements.flatMap((statement) =>
				ts.isVariableStatement(statement)
					? [...statement.declarationList.declarations]
					: [],
			)
			for (const example of demoExamples) {
				const name = example.label === 'Read' ? 'articles' : 'article'
				const declaration = declarations.find(
					(item) => item.name.getText(compiled) === name,
				)
				if (!declaration) throw new Error(`Missing sample variable: ${name}`)
				const inferred = checker.getTypeAtLocation(declaration.name)
				const model =
					example.label === 'Read'
						? checker.getIndexTypeOfType(inferred, ts.IndexKind.Number)
						: inferred
				if (!model) throw new Error('Missing inferred Article model')
				for (const field of example.fields) {
					const property = model.getProperty(field.name)
					if (!property) throw new Error(`Missing model field: ${field.name}`)
					expect(
						checker.typeToString(
							checker.getTypeOfSymbolAtLocation(property, declaration),
						),
					).toBe(field.type)
				}
				if (example.label === 'Read')
					expect(model.getProperty('published')).toBeUndefined()
			}
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	}, 20_000)
})
