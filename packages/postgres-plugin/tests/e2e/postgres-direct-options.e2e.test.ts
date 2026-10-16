import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

describe.each([
	['source', '../../src/index.js'],
	['packed', '@ultimabase/postgres-plugin'],
] as const)('%s configured PostgreSQL options', (_mode, moduleName) => {
	it('projects exact schema rules and stored-field options', () => {
		const fileName = path.join(
			import.meta.dirname,
			`postgres-source-options.${_mode}.fixture.ts`,
		)
		const source = `import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '${moduleName}'
const App = UltimaBase.use(postgresPlugin({ url: 'postgresql://localhost/fixture' }))
const Post = App.Schema.define({
  className: 'PostgresSourceOptionPost',
  fields: (field) => ({ title: field.string({ postgres: { renamedFrom: 'headline' } }) }),
}).with({ postgres: { table: 'posts' } })
void Post`
		const service = createLanguageService(fileName, source)
		expect(
			service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, ' '),
				),
		).toStrictEqual([])
	})

	it('keeps PostgreSQL options absent from an unrelated configured factory', () => {
		const fileName = path.join(
			import.meta.dirname,
			`postgres-absent-options.${_mode}.fixture.ts`,
		)
		const source = `import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '${moduleName}'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'
void postgresPlugin
const Other = UltimaBase.use(pgVectorPlugin())
Other.Schema.define({
  className: 'PostgresAbsentOptionPost',
  fields: () => ({}),
}).with({ postgres: { table: 'posts' } })`
		const messages = createLanguageService(fileName, source)
			.getSemanticDiagnostics(fileName)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, ' '),
			)
		expect(messages.some((message) => message.includes('postgres'))).toBe(true)
	})
})

it('packs exact PostgreSQL rule and option autocomplete', () => {
	const fileName = path.join(
		import.meta.dirname,
		'postgres-direct-options.packed.fixture.ts',
	)
	const schemaMarker = '/* postgres-schema */'
	const fieldMarker = '/* postgres-field */'
	const sourceWithMarkers = `import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import type {
  PostgresFieldOption,
  PostgresPluginExports,
  PostgresSchemaOption,
} from '@ultimabase/postgres-plugin'
// @ts-expect-error Migration (ADR-0266) and physical (ADR-0289) adapter metadata were removed.
void (undefined as unknown as PostgresPluginExports).adapterMetadata
declare const postgresField: PostgresFieldOption
declare const postgresSchema: PostgresSchemaOption
const App = UltimaBase.use(postgresPlugin({ url: 'postgresql://localhost/fixture' }))
const PackedPost = App.Schema.define({
  className: 'PackedPostgresOptionPost',
  fields: (field) => ({
    title: field.string({ postgres: { ${fieldMarker}...postgresField } }),
  }),
}).with({ postgres: { ${schemaMarker}...postgresSchema } })
void PackedPost
`
	const positions = new Map(
		[schemaMarker, fieldMarker].map((marker) => [
			marker,
			sourceWithMarkers.indexOf(marker),
		]),
	)
	const source = [schemaMarker, fieldMarker].reduce(
		(contents, marker) => contents.replace(marker, ' '.repeat(marker.length)),
		sourceWithMarkers,
	)
	const service = createLanguageService(fileName, source)
	const completions = (marker: string): readonly string[] => {
		const position = positions.get(marker)

		if (position === undefined || position < 0) {
			throw new TypeError(`Missing PostgreSQL option marker: ${marker}`)
		}

		return (
			service
				.getCompletionsAtPosition(fileName, position, {})
				?.entries.map(({ name }) => name) ?? []
		)
	}

	expect(completions(schemaMarker)).toContain('table')
	expect(completions(fieldMarker)).toContain('renamedFrom')
	expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])

	const removedSource = `import {
  postgresColumn,
  postgresTable,
  type PostgresColumnExtension,
  type PostgresTableExtension,
  postgresMigrationContributionCapability,
  postgresUpgrade,
  postgresSchemaPreparationCapability,
  type PostgresSchemaPreparationCapability,
} from '@ultimabase/postgres-plugin'`
	const removedDiagnostics = createLanguageService(
		fileName.replace('.ts', '.removed.ts'),
		removedSource,
	)
		.getSemanticDiagnostics(fileName.replace('.ts', '.removed.ts'))
		.map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, ' '))

	for (const removed of [
		'postgresColumn',
		'postgresTable',
		'PostgresColumnExtension',
		'PostgresTableExtension',
		'postgresMigrationContributionCapability',
		'postgresUpgrade',
		'postgresSchemaPreparationCapability',
		'PostgresSchemaPreparationCapability',
	]) {
		expect(
			removedDiagnostics.some((message) => message.includes(removed)),
		).toBe(true)
	}
}, 20_000)

it('keeps PostgreSQL options unknown without the PostgreSQL plugin', () => {
	const fileName = path.join(
		import.meta.dirname,
		'postgres-direct-options.missing-plugin.fixture.ts',
	)
	const source = `import { UltimaBase } from '@ultimabase/core'
UltimaBase.Schema.define({
  className: 'MissingPostgresPlugin',
  fields: (field) => ({
    title: field.string({ postgres: { renamedFrom: 'headline' } }),
  }),
}).with({ postgres: { table: 'missing_posts' } })`
	const messages = createLanguageService(fileName, source)
		.getSemanticDiagnostics(fileName)
		.map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, ' '))

	expect(messages.some((message) => message.includes('postgres'))).toBe(true)
})

it('compiles PostgreSQL rules and options from JavaScript', async () => {
	const executeFile = promisify(execFile)
	const fixture = path.join(
		import.meta.dirname,
		'fixtures/postgres-direct-options-javascript.mjs',
	)
	const { stdout } = await executeFile(process.execPath, [fixture])
	const output: unknown = JSON.parse(stdout)

	expect(output).toStrictEqual({
		first: {
			field: { renamedFrom: 'headline' },
			fieldOwner: {
				kind: 'plugin',
				pluginId: '@ultimabase/postgres-plugin',
				version: '0.0.0',
			},
			schema: { table: 'first_posts' },
			schemaOwner: {
				kind: 'plugin',
				pluginId: '@ultimabase/postgres-plugin',
				version: '0.0.0',
			},
		},
		missingPluginCode: 'PLUGIN_DECLARATION_INVALID',
		missingRuleMessage:
			'JavaScriptPostgresMissingRule.with({ postgres }): postgres is not a rule of an installed plugin; .with accepts relations',
		// The old `define({ postgres })` form is rejected (ADR-0297).
		oldFormMessage:
			'Unknown schema option: postgres. define() takes className, fields and indexes; plugin rules go in the final .with(...)',
	})
})
