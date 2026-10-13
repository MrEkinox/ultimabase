import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/soft-delete-option-javascript.mjs',
)

it('compiles the packed shape method from JavaScript', async () => {
	const { stdout } = await executeFile(process.execPath, [fixturePath])
	const output: unknown = JSON.parse(stdout)
	const commands = [
		'softDeleteOne',
		'softDeleteMany',
		'restoreOne',
		'restoreMany',
		'purgeOne',
		'purgeMany',
	]

	expect(output).toStrictEqual({
		commandMode: { mode: 'command' },
		commandSchemaMutations: commands,
		deletedAt: 'dateTime',
		logicalMode: {},
		logicalSchemaMutations: commands,
		owner: {
			kind: 'plugin',
			pluginId: '@ultimabase/soft-delete-plugin',
			version: '0.0.0',
		},
		plainSchemaMutations: [],
		plainTombstone: true,
		tombstone: { default: false, required: true },
	})
})

describe.each([
	['source', '../../src/index.js'],
	['packed', '@ultimabase/soft-delete-plugin'],
] as const)('%s inherited soft-delete surface', (mode, moduleName) => {
	it('types the shape method and leaves other schemas untouched', () => {
		const fileName = path.join(
			import.meta.dirname,
			`soft-delete-shape.${mode}.fixture.ts`,
		)
		const source = `import { UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '${moduleName}'
const App = UltimaBase.use(softDeletePlugin())
const Enabled = App.Schema.define({ className: 'EnabledPost', fields: (field) => ({ title: field.string() }) }).softDelete()
const Plain = App.Schema.define({ className: 'PlainPost', fields: (field) => ({ title: field.string() }) })
void Enabled.softDeleteOne({ id: 'post-1', select: { isDeleted: true, deletedAt: true } })
void Enabled.restoreMany({ where: { title: { eq: 'post' } } })
void Enabled.purgeOne({ id: 'post-1' })
void Plain`
		const service = createLanguageService(fileName, source)
		expect(
			service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, ' '),
				),
		).toStrictEqual([])
		const enabled = service.getCompletionsAtPosition(
			fileName,
			source.indexOf('Enabled.softDeleteOne') + 'Enabled.'.length,
			{},
		)
		const absentSource = source.replace('void Plain', 'void Plain.')
		const absentService = createLanguageService(fileName, absentSource)
		const plain = absentService.getCompletionsAtPosition(
			fileName,
			absentSource.lastIndexOf('Plain.') + 'Plain.'.length,
			{},
		)
		expect(enabled?.entries.map(({ name }) => name)).toEqual(
			expect.arrayContaining([
				'softDeleteOne',
				'softDeleteMany',
				'restoreOne',
				'restoreMany',
				'purgeOne',
				'purgeMany',
			]),
		)
		expect(plain?.entries.map(({ name }) => name)).not.toContain(
			'softDeleteOne',
		)
		expect(plain?.entries.map(({ name }) => name)).not.toContain('restoreOne')
	})
})
