import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
	virtualFieldExample,
	accessSchemaExample,
	validationFieldExample,
} from '../components/landing/capability-content'
import { compositionExamples } from '../components/landing/composition-content'
import { schemaExample } from '../components/landing/content'
import { transportExamples } from '../components/landing/transport-content'
import {
	compileLandingApplication,
	compileLandingSample,
	formatLandingDiagnostics,
	withLandingDirectory,
} from './landing-check'

describe('landing plugin stacks', () => {
	it.each(compositionExamples)(
		'compiles and validates the $label preset without opening infrastructure',
		async (example) => {
			await withLandingDirectory(async (directory) => {
				const source =
					schemaExample +
					'\n' +
					example.code
						.replace("import { Article } from './article.js'", '')
						.replace("import { UltimaBase } from '@ultimabase/core'", '')
						.replace('const ultimabase =', 'export const ultimabase =')
				// Remove startup only from the loaded module; retain it in the compiler input below.
				const compiled = await compileLandingApplication(
					path.join(directory, 'application-runtime.ts'),
					source
						.replace('await using started = await ultimabase.start()', '')
						.replace(/\n.*\nawait started\.closed$/u, ''),
				)
				expect(compiled.schemas.has('Article')).toBe(true)
				const program = await compileLandingSample(
					path.join(directory, 'application.ts'),
					source,
				)
				expect(formatLandingDiagnostics(program)).toBe('')
			})
		},
		20_000,
	)

	it('typechecks the direct request against the existing full-stack application', async () => {
		await withLandingDirectory(async (directory) => {
			const code = transportExamples[0].code.replace(
				"'./src/schema.ts'",
				"'../examples/full-stack/src/schema.ts'",
			)
			const program = await compileLandingSample(
				path.join(directory, 'request.ts'),
				`import { createUltimabase } from '../examples/full-stack/src/ultimabase.ts'\ndeclare const app: ReturnType<typeof createUltimabase>\n${code}`,
			)
			expect(formatLandingDiagnostics(program)).toBe('')
		})
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
  { data: { title: 'A validated title' }, select: { title: true } }
)
const title: string = article.title
// @ts-expect-error Validation must preserve the declared field type.
const invalid: number = article.title
void title; void invalid`,
	},
])(
	'checks the advertised $name schema and inferred results',
	async (example) => {
		await withLandingDirectory(async (directory) => {
			// The schema joins an application with storage and every showcased plugin.
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
export const ultimabase = new RuntimeConfiguredApplication({ schemas: [${example.schema}] })
declare module '@ultimabase/core' {
  interface Register {
    readonly app: typeof ultimabase
  }
}`
			const compiled = await compileLandingApplication(
				path.join(directory, 'capability-runtime.ts'),
				source,
			)
			expect(compiled.schemas.has(example.schema)).toBe(true)
			const program = await compileLandingSample(
				path.join(directory, 'capability.ts'),
				`${source}\nawait ultimabase.start()\n${example.checks}`,
			)
			expect(formatLandingDiagnostics(program)).toBe('')
		})
	},
	20_000,
)
