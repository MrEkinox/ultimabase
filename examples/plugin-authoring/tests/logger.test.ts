import { UltimaBase } from '@ultimabase/core'
import { createCapturingLogger } from '@ultimabase/testing/plugins'
import { expect, it } from 'vitest'

import { tracePlugin } from '../src/trace-plugin.ts'

it('logs the derived default and its source at debug level', async () => {
	const App = UltimaBase.use(tracePlugin())

	//#region capturing-logger
	const logger = createCapturingLogger()
	const app = new App({ schemas: [], logger, logLevel: 'debug' })
	await app.start()

	expect(logger.messages('warn')).toEqual([])
	expect(logger.lines.at(-1)?.message).toMatch(/^UltimaBase started:/u)
	//#endregion capturing-logger

	try {
		expect(app.plugin('community.trace')).toStrictEqual({ verbose: true })
		expect(logger.messages('debug')).toContain(
			'[community.trace] verbose true (NODE_ENV is not production)',
		)
	} finally {
		await app.dispose()
	}
})
