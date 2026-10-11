import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execute = promisify(execFile)
const workspaceRoot = path.resolve(import.meta.dirname, '../../../..')

describe('packed JavaScript plugin conformance', () => {
	it('runs the same public suite without Typegen or TypeScript execution', async () => {
		const source = `
import { plugin } from '@ultimabase/core/plugin'
import {
  createPluginConformanceFixture,
  definePluginConformanceSuite,
  runPluginConformance,
} from '@ultimabase/testing'

const suite = definePluginConformanceSuite({
  createFixture: () => createPluginConformanceFixture({
    subject: plugin({
      core: '^0.0.0',
      id: 'community.javascript-conformance',
      version: '1.0.0',
      contributions: [],
    }),
  }),
  expected: {
    core: '^0.0.0',
    pluginId: 'community.javascript-conformance',
    version: '1.0.0',
  },
})

const report = await runPluginConformance(suite)
process.stdout.write(JSON.stringify(report.checks))
`
		const { stdout } = await execute(
			process.execPath,
			['--input-type=module', '-e', source],
			{ cwd: workspaceRoot },
		)
		const checks: unknown = JSON.parse(stdout)
		expect(checks).toEqual(
			expect.arrayContaining([
				{ contract: 'manifest', status: 'passed' },
				{ contract: 'lifecycle-cleanup', status: 'passed' },
			]),
		)
	})
})
