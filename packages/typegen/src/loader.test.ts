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
import { definePlugin, Schema, UltimaBase } from '@ultimabase/core'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'

const SetupGuard = definePlugin({
  pluginId: 'fixture.loader-setup-guard',
  version: '0.0.0',
  core: '^0.0.0',
  setup() {
    throw new TypeError('typegen loader must not run plugin setup')
  },
})

const Document = Schema.define({
  className: 'LoadedTypegenDocument',
  fields: (field) => ({
    title: field.string({ validation: { required: true } }),
    embedding: field.vector({ dimensions: 3 }),
  }),
})

export const ultimabase = new UltimaBase({
  plugins: [pgVectorPlugin(), SetupGuard],
  schemas: [Document],
})
`)
		const application = await loadTypegenApplication({
			exportName: 'ultimabase',
			sourcePath,
		})
		const generated = generateApplicationTypes({
			application,
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
})
