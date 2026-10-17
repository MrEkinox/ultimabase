import { UltimaBase } from '@ultimabase/core'
import {
	createPluginConformanceFixture,
	definePluginConformanceSuite,
	runPluginConformance,
} from '@ultimabase/testing/plugins'
import { expect, it } from 'vitest'

import { archivePlugin } from '../src/archive-plugin.ts'
import { formatConsumer, formatProvider } from '../src/format-capability.ts'
import { starterPlugin } from '../src/starter-plugin.ts'
import { formatWorkflow } from '../src/workflow/operations.ts'
import { workflowPlugin } from '../src/workflow/plugin.ts'

it('runs the common suite with the schemas a feature types', async () => {
	const suite = definePluginConformanceSuite({
		// The subject and the schemas that set its feature, together.
		createFixture: () => {
			const subject = archivePlugin()
			const Post = UltimaBase.use(subject).Schema.define({
				className: 'Post',
				fields: (f) => ({ title: f.string({ required: true }) }),
				archivable: true,
			})
			return createPluginConformanceFixture({ subject, schemas: [Post] })
		},
		expected: {
			pluginId: '@example/archive-plugin',
			version: '0.0.0',
			core: '^0.0.0',
		},
	}).check('schema-surface', (context) => {
		const { ultimabase } = context.createUltimaBase()
		const [surface] = ultimabase.compile().schemaSurfaces
		expect(surface?.schema.className).toBe('Post')
		expect([...(surface?.schemaMutations.keys() ?? [])]).toStrictEqual([
			'archiveOne',
			'archiveMany',
		])
	})

	// A failed contract throws a PluginConformanceError that names it.
	const { checks } = await runPluginConformance(suite)
	expect(checks.map(({ contract }) => contract)).toContain('manifest')
})

it('checks two explicit instances of one factory', async () => {
	const suite = definePluginConformanceSuite({
		createFixture: () =>
			createPluginConformanceFixture({
				subject: starterPlugin('default'),
			}),
		expected: {
			pluginId: 'community.starter',
			version: '1.0.0',
			core: '^0.0.0',
		},
		instances: {
			instanceIds: ['primary', 'archive'],
			create: (instanceId) => starterPlugin(instanceId),
		},
	})

	// A failed contract throws a PluginConformanceError that names it.
	const { checks } = await runPluginConformance(suite)
	expect(checks.map(({ contract }) => contract)).toContain('manifest')
})

it('installs a support plugin that provides a required capability', async () => {
	const suite = definePluginConformanceSuite({
		createFixture: () =>
			createPluginConformanceFixture({
				subject: formatConsumer,
				supportPlugins: [formatProvider],
			}),
		expected: {
			pluginId: 'community.workflow-consumer',
			version: '1.0.0',
			core: '^0.0.0',
		},
	})

	// A failed contract throws a PluginConformanceError that names it.
	const { checks } = await runPluginConformance(suite)
	expect(checks.map(({ contract }) => contract)).toContain('manifest')
})

it('adds an optional operation check', async () => {
	const suite = definePluginConformanceSuite({
		createFixture: () =>
			createPluginConformanceFixture({ subject: workflowPlugin() }),
		expected: {
			pluginId: 'community.workflow',
			version: '1.0.0',
			core: '^0.0.0',
		},
	}).check('operation', (context) => {
		// Executing a request would need a database adapter among the support
		// plugins; the compiled application already lists the declaration.
		const { ultimabase } = context.createUltimaBase()
		expect(
			ultimabase.compile().operations.map(({ operation }) => operation.name),
		).toStrictEqual([formatWorkflow.name])
	})

	const { checks } = await runPluginConformance(suite)
	expect(checks.map(({ contract }) => contract)).toContain('operation')
})
