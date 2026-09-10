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
		omissionPreserved: true,
		owner: {
			kind: 'plugin',
			pluginId: '@ultimabase/soft-delete-plugin',
			version: '0.0.0',
		},
	})
})
