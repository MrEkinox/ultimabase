import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect, it } from 'vitest'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/http-application-no-typegen.mjs',
)

it('runs the packed HTTP application from JavaScript without Typegen', async () => {
	const { stdout } = await executeFile(process.execPath, [fixturePath])
	const output: unknown = JSON.parse(stdout)

	expect(output).toStrictEqual({
		appId: 'javascript-app',
		owner: { pluginId: 'fixture.javascript-http-route' },
		response: 'typegen-free',
	})
})
