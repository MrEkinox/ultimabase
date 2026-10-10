import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/soft-delete-option-no-typegen.mjs',
)

it('compiles the packed soft-delete option from JavaScript without Typegen', async () => {
	const { stdout } = await executeFile(process.execPath, [fixturePath])
	const output: unknown = JSON.parse(stdout)

	expect(output).toStrictEqual({
		defaultMode: 'replace-delete',
		explicitMode: 'explicit',
		explicitSchemaMutations: ['softDelete', 'restore', 'purge'],
		explicitTombstone: { default: false, required: true },
		omissionPreserved: true,
		omittedSchemaMutations: ['restore', 'purge'],
		omittedTombstoneOwner: '@ultimabase/soft-delete-plugin',
		owner: {
			kind: 'plugin',
			pluginId: '@ultimabase/soft-delete-plugin',
			version: '0.0.0',
		},
	})
})

describe.each([
	['source', '../../src/index.js'],
	['packed', '@ultimabase/soft-delete-plugin'],
] as const)('%s inherited soft-delete surface', (mode, moduleName) => {
	it('types omitted-schema defaults and excludes direct false overrides', () => {
		const fileName = path.join(
			import.meta.dirname,
			`soft-delete-default.${mode}.fixture.ts`,
		)
		const source = `import { UltimaBase } from '@ultimabase/core'
import { softDeletePlugin } from '${moduleName}'
const App = UltimaBase.use(softDeletePlugin({ defaultMode: 'explicit' }))
const Enabled = App.Schema.define({ className: 'EnabledPost', fields: (field) => ({ title: field.string() }) })
const Disabled = App.Schema.define({ className: 'DisabledPost', fields: (field) => ({ title: field.string() }), softDelete: false })
void Enabled.softDelete({ id: 'post-1', select: { isDeleted: true } })
void Enabled.restore({ id: 'post-1', select: { isDeleted: true } })
void Enabled.purge({ id: 'post-1' })
void Disabled`
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
			source.indexOf('Enabled.softDelete') + 'Enabled.'.length,
			{},
		)
		const absentSource = source.replace('void Disabled', 'void Disabled.')
		const absentService = createLanguageService(fileName, absentSource)
		const disabled = absentService.getCompletionsAtPosition(
			fileName,
			absentSource.lastIndexOf('Disabled.') + 'Disabled.'.length,
			{},
		)
		expect(enabled?.entries.map(({ name }) => name)).toContain('softDelete')
		expect(disabled?.entries.map(({ name }) => name)).not.toContain(
			'softDelete',
		)
		expect(disabled?.entries.map(({ name }) => name)).not.toContain('restore')
	})
})
