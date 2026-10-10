import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	generateApplicationTypes,
	loadTypegenApplication,
} from '@ultimabase/typegen'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	virtualFieldExample,
	accessSchemaExample,
	validationFieldExample,
} from '../components/landing/capability-content'
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
						.replace("import { UltimaBase } from '@ultimabase/core'", '')
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
					ultimabase: application,
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

// The showcase uses the same source strings as these compiled, application-local fixtures.
it.each([
	{
		name: 'row access',
		code: accessSchemaExample,
		schema: 'PublicArticle',
		checks: '',
	},
	{
		name: 'virtual fields',
		code: virtualFieldExample,
		schema: 'Profile',
		checks: `const profile = await Profile.findOneOrThrow(
  { where: { id: { eq: 'example' } }, select: { displayName: true } }
)
const name: string = profile.displayName
// @ts-expect-error Private virtual dependencies are not selected result properties.
profile.firstName
void name`,
	},
	{
		name: 'Standard Schema validation',
		code: validationFieldExample,
		schema: 'ValidatedArticle',
		checks: `const article = await ValidatedArticle.createOne(
  { data: { title: 'A validated title' } }
)
const title: string = article.title
// @ts-expect-error Validation must preserve the declared field type.
const invalid: number = article.title
void title; void invalid`,
	},
])(
	'checks the advertised $name schema and inferred results',
	async (example) => {
		const directory = await mkdtemp(path.join(root, '.landing-check-'))
		try {
			const filename = path.join(directory, 'capability.ts')
			const source = `${example.code}
import { UltimaBase as RuntimeApplication } from '@ultimabase/core'
import { postgresPlugin as runtimePostgresPlugin } from '@ultimabase/postgres-plugin'
import { validationPlugin as runtimeValidationPlugin } from '@ultimabase/validation-plugin'
import { accessPlugin as runtimeAccessPlugin } from '@ultimabase/access-plugin'
const RuntimeConfiguredApplication = RuntimeApplication.use(
  runtimePostgresPlugin({ url: 'postgres://localhost/landing_check' }),
  runtimeValidationPlugin(),
  runtimeAccessPlugin(),
)
export const app = new RuntimeConfiguredApplication({ schemas: [${example.schema}] })`
			await writeFile(filename, source)
			const application = await loadTypegenApplication({
				sourcePath: filename,
				exportName: 'app',
			})
			const generated = generateApplicationTypes({
				ultimabase: application,
				applicationId: 'capability',
			})
			await writeFile(
				path.join(directory, 'capability.generated.d.ts'),
				generated.contents,
			)
			await writeFile(
				filename,
				`/// <reference path="./capability.generated.d.ts" />\n${source}\nawait app.start()\n${example.checks}`,
			)
			assertCompiles(filename)
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	},
	20_000,
)
