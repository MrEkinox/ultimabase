import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect, it } from 'vitest'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/acl-direct-option-javascript.mjs',
)

it('compiles the acl feature from JavaScript', async () => {
	const { stdout } = await executeFile(process.execPath, [fixturePath])
	const output: unknown = JSON.parse(stdout)

	expect(output).toStrictEqual({
		fieldKind: 'ultimabase.acl',
		missingPluginCode: 'PLUGIN_DECLARATION_INVALID',
		optionPresent: true,
		owner: {
			kind: 'plugin',
			pluginId: '@ultimabase/acl-permissions-plugin',
			version: '0.0.0',
		},
		unknownRuleMessage:
			'JavaScriptUnknownRuleACLPost.with({ acl }): acl is not a rule of an installed plugin; .with accepts relations',
	})
})
