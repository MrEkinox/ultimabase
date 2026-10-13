import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect, it } from 'vitest'

const executeFile = promisify(execFile)
const fixturePath = path.join(
	import.meta.dirname,
	'fixtures/http-application-javascript.mjs',
)

it('runs the packed HTTP application from JavaScript', async () => {
	const { stdout } = await executeFile(process.execPath, [fixturePath])
	const output: unknown = JSON.parse(stdout)

	expect(output).toStrictEqual({
		appId: 'javascript-app',
		absentStatus: 401,
		absentRequestId: 'absent.request',
		owner: { pluginId: 'fixture.javascript-http-route' },
		portFree: 'typegen-free',
		response: 'typegen-free',
	})
})
