import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect, it } from 'vitest'

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
		explicitModelMutations: ['softDelete'],
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
