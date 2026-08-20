import { Schema } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
	withPluginTypegenConformance,
} from '@ultimabase/testing'
import { describe, expect, it } from 'vitest'

const createProofSchema = () =>
	Schema.define({
		className: 'OfficialCapabilityConformancePost',
		fields: (field) => ({ title: field.string() }),
	})

describe('official optional capability conformance', () => {
	it('proves Hooks through the public conformance and Typegen contracts', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({
					schemas: [createProofSchema()],
					subject: hooksPlugin(),
				}),
			expected: {
				core: '^0.0.0',
				environment: [],
				pluginId: '@ultimabase/hooks-plugin',
				privileges: ['schema:declare', 'runtime:intercept'],
				version: '0.0.0',
			},
		})
		const report = await runPluginConformance(
			withPluginTypegenConformance(suite, {
				applicationId: 'official-hooks-conformance',
				verify: ({ contents }) => {
					expect(contents).toContain('@ultimabase/hooks-plugin')
					expect(contents).toContain('FieldHooksOption')
					expect(contents).toContain('SchemaHooksOption')
				},
			}),
		)

		expect(report.checks.map(({ contract }) => contract)).toContain('typegen')
	})

	it('proves Access through the public conformance and Typegen contracts', async () => {
		const suite = definePluginConformanceSuite({
			createFixture: () =>
				createPluginConformanceFixture({
					schemas: [createProofSchema()],
					subject: accessPlugin(),
				}),
			expected: {
				core: '^0.0.0',
				environment: [],
				pluginId: '@ultimabase/access-plugin',
				privileges: ['schema:declare', 'runtime:constrain'],
				version: '0.0.0',
			},
		})
		const report = await runPluginConformance(
			withPluginTypegenConformance(suite, {
				applicationId: 'official-access-conformance',
				verify: ({ contents }) => {
					expect(contents).toContain('@ultimabase/access-plugin')
					expect(contents).toContain('FieldAccessOption')
					expect(contents).toContain('SchemaAccessOption')
				},
			}),
		)

		expect(report.checks.map(({ contract }) => contract)).toContain('typegen')
	})
})
