import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../application/framework-application.js'

import { contributeDeclarations } from './plugin-contributions.js'
import { plugin as createPlugin } from './plugin.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

describe('plugin schema source staging', () => {
	it.each([
		{ kind: 'addition', method: 'add' as const },
		{ kind: 'claim', method: 'claim' as const },
	])('preserves the distinct Schema $kind diagnostics', ({ kind, method }) => {
		const label = `Schema ${kind}`
		const Record = UltimaBase.Schema.define({
			className: `Invalid${kind === 'addition' ? 'Addition' : 'Claim'}Record`,
			fields: () => ({}),
		})
		const cases: readonly Readonly<{
			expected: string
			options: unknown
		}>[] = [
			{ expected: `${label} must be a plain object`, options: [] },
			{
				expected: `${label} contributionId must be a non-empty string`,
				options: { contributionId: '', schema: Record },
			},
			{
				expected: `${label} staticOptions must be a JSON object`,
				options: {
					contributionId: 'record',
					schema: Record,
					staticOptions: [],
				},
			},
		]

		for (const [index, fixture] of cases.entries()) {
			const plugin = createPlugin({
				core: '^0.0.0',
				id: `fixture.invalid-schema-${kind}-${String(index)}`,
				permissions: { 'schema:declare': `Exercises ${kind} validation.` },
				version: '1.0.0',
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas[method](fixture.options as never)
							return undefined
						},
					}),
				],
			})
			const application = new FrameworkApplication({
				pluginPrivileges: { logger: false },
				plugins: [plugin],
				schemas: method === 'claim' ? [Record] : [],
			})

			expect(() => application.compileSchemas()).toThrow(fixture.expected)
		}
	})
})
