import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { SchemaTypegenError } from './errors.js'
import { generateApplicationTypes } from './generator.js'
import { loadTypegenApplication } from './loader.js'

const temporaryDirectories: string[] = []

const createTypeScriptModule = async (source: string): Promise<string> => {
	const directory = await mkdtemp(
		path.join(process.cwd(), '.typegen-loader-fixture-'),
	)
	const sourcePath = path.join(directory, 'application.ts')

	temporaryDirectories.push(directory)
	await writeFile(sourcePath, source, 'utf8')

	return sourcePath
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true })),
	)
})

describe('loadTypegenApplication', () => {
	it('transpiles an unresolved plugin method and never runs plugin setup', async () => {
		const sourcePath = await createTypeScriptModule(`
import { UltimaBase } from '@ultimabase/core'
import { contributeApplication, plugin } from '@ultimabase/core/plugin'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'

const SetupGuard = plugin({
  id: 'fixture.loader-setup-guard',
  version: '0.0.0',
  core: '^0.0.0',
  contributions: [contributeApplication(() => {
    throw new TypeError('typegen loader must not run plugin setup')
  })],
})

const Application = UltimaBase.use(pgVectorPlugin(), SetupGuard)
const Document = Application.Schema.define({
  className: 'LoadedTypegenDocument',
  fields: (field) => ({
    title: field.string({ required: true }),
    embedding: field.vector({ dimensions: 3 }),
  }),
})

export const ultimabase = new Application({
  schemas: [Document],
})
`)
		const application = await loadTypegenApplication({
			exportName: 'ultimabase',
			sourcePath,
		})
		const generated = generateApplicationTypes({
			ultimabase: application,
			applicationId: 'fixture.loaded',
		})

		expect(generated.contents).toContain(
			'readonly vector: Plugin0_VectorFieldBuilderMethod',
		)
		expect(generated.contents).toContain(
			'readonly embedding: Plugin0_VectorValue | null',
		)
	})

	it('reports invalid exports with their source owner', async () => {
		const sourcePath = await createTypeScriptModule(
			'export const invalid = { schemas: [] }\n',
		)
		const expected: Partial<SchemaTypegenError> = {
			code: 'SCHEMA_TYPEGEN_FAILED',
			owner: 'invalid',
			path: sourcePath,
			reason: 'invalid-application-export',
		}

		await expect(
			loadTypegenApplication({ exportName: 'invalid', sourcePath }),
		).rejects.toMatchObject(expected)
	})

	it('generates path-independent output from separate clean source trees', async () => {
		const source = `
import { UltimaBase } from '@ultimabase/core'
const Document = UltimaBase.Schema.define({
  className: 'PathIndependentDocument',
  fields: (field) => ({ title: field.string({ required: true }) }),
})
export const ultimabase = new UltimaBase({ schemas: [Document] })
`
		const firstPath = await createTypeScriptModule(source)
		const secondPath = await createTypeScriptModule(source)
		const first = generateApplicationTypes({
			ultimabase: await loadTypegenApplication({
				exportName: 'ultimabase',
				sourcePath: firstPath,
			}),
			applicationId: 'fixture.path-independent',
		})
		const second = generateApplicationTypes({
			ultimabase: await loadTypegenApplication({
				exportName: 'ultimabase',
				sourcePath: secondPath,
			}),
			applicationId: 'fixture.path-independent',
		})

		expect(second).toStrictEqual(first)
		expect(first.contents).not.toContain(path.dirname(firstPath))
		expect(second.contents).not.toContain(path.dirname(secondPath))
	})

	// Regression: an omitted option crashed on `.trim()` with a generic
	// "Cannot read properties of undefined" error from JavaScript callers.
	it('names an omitted sourcePath or exportName from JavaScript callers', async () => {
		await expect(
			loadTypegenApplication({ exportName: 'ultimabase' } as never),
		).rejects.toThrow(new TypeError('sourcePath must be a non-empty string'))
		await expect(
			loadTypegenApplication({ sourcePath: './application.ts' } as never),
		).rejects.toThrow(new TypeError('exportName must be a non-empty string'))
	})
})
