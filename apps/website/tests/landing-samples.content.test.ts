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
const slug: string | undefined = articles[0]?.slug
// @ts-expect-error A field excluded by select must not leak into the result type.
articles[0]?.published
// @ts-expect-error The schema requires a string title.
const invalid: number = article.title
void title; void slug; void invalid;
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
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	})
})
