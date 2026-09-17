import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	generateApplicationTypes,
	loadTypegenApplication,
} from '@ultimabase/typegen'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { compositionExamples } from '../components/landing/composition-content'
import { schemaExample } from '../components/landing/content'
import { transportExamples } from '../components/landing/transport-content'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const compilerOptions: ts.CompilerOptions = {
	module: ts.ModuleKind.NodeNext,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
	noEmit: true,
	strict: true,
	skipLibCheck: true,
	target: ts.ScriptTarget.ES2024,
	types: ['node'],
	allowImportingTsExtensions: true,
}

const assertCompiles = (filename: string) => {
	const program = ts.createProgram([filename], compilerOptions)
	expect(
		ts.formatDiagnosticsWithColorAndContext(ts.getPreEmitDiagnostics(program), {
			getCanonicalFileName: (name) => name,
			getCurrentDirectory: () => root,
			getNewLine: () => '\n',
		}),
	).toBe('')
}

describe('landing plugin stacks', () => {
	it.each(compositionExamples)(
		'compiles and validates the $label preset without opening infrastructure',
		async (example) => {
			const directory = await mkdtemp(path.join(root, '.landing-check-'))
			try {
				const filename = path.join(directory, 'application.ts')
				// Remove startup only from the loader input; retain it in the compiler input below.
				const source =
					schemaExample +
					'\n' +
					example.code
						.replace("import { Article } from './article.js'", '')
						.replace('const app =', 'export const app =')
				await writeFile(
					filename,
					source
						.replace(
							'process.env.DATABASE_URL',
							"'postgres://localhost/landing_check'",
						)
						.replace('await app.start()', ''),
				)
				const application = await loadTypegenApplication({
					sourcePath: filename,
					exportName: 'app',
				})
				const generated = generateApplicationTypes({
					application,
					applicationId: 'landing',
				})
				expect(generated.contents).toContain('Article')
				await writeFile(filename, source)
				assertCompiles(filename)
			} finally {
				await rm(directory, { recursive: true, force: true })
			}
		},
		20_000,
	)

	it('typechecks the direct request against the existing minimal application', async () => {
		const directory = await mkdtemp(path.join(root, '.landing-check-'))
		try {
			const filename = path.join(directory, 'request.ts')
			const code = transportExamples[0].code.replace(
				"'./src/schema.ts'",
				"'../examples/minimal/src/schema.ts'",
			)
			await writeFile(
				filename,
				`import { createMinimalApplication } from '../examples/minimal/src/create-application.ts'\ndeclare const app: ReturnType<typeof createMinimalApplication>\n${code}`,
			)
			assertCompiles(filename)
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	}, 20_000)
})
