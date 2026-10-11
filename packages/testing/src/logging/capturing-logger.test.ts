import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { createCapturingLogger } from './capturing-logger.js'

// ADR-0313: testing provides a capturing logger.
describe('createCapturingLogger', () => {
	it('records application lines by level and forgets them on clear', async () => {
		const logger = createCapturingLogger()
		const ultimabase = new UltimaBase({
			logLevel: 'debug',
			logger,
			schemas: [],
		})
		await ultimabase.start()
		await ultimabase.dispose()

		expect(logger.messages('debug')).toEqual([
			'UltimaBase plugin privilege report',
		])
		expect(logger.lines[0]?.details).toBe(ultimabase.pluginPrivilegeReport)
		expect(logger.messages('info')).toEqual([
			"UltimaBase started: 0 schemas, 0 plugins; no critical privileges. Use logLevel 'debug' for the privilege report.",
		])
		expect(logger.messages()).toHaveLength(2)
		logger.clear()
		expect(logger.lines).toEqual([])
	})
})
