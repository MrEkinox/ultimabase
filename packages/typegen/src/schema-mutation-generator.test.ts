import {
	FrameworkApplication,
	Schema,
	defineOperationValue,
	definePlugin,
	defineSchemaMutation,
	defineTypegenReference,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

describe('schema mutation Typegen', () => {
	it('emits deterministic callback-free schema and model methods', () => {
		const inputReference = defineTypegenReference({
			exportName: 'BaseItem',
			module: '@ultimabase/core',
		})
		const Post = Schema.define({
			className: 'TypegenSchemaMutationPost',
			fields: (field) => ({
				title: field.string(),
				workflowState: field.string(),
			}),
		})
		const archive = defineSchemaMutation({
			authority: 'request',
			effect: 'update',
			errors: ['fixture.workflow.archive-rejected'] as const,
			input: defineOperationValue(
				(value) => immutableRecord({ value }),
				inputReference,
			),
			name: 'fixture.workflow.archive',
			returning: 'after',
			select: { workflowState: true },
			version: '1.1.0',
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-typegen',
			privileges: [
				{ name: 'model:extend', reason: 'Adds archive methods.' },
				{ name: 'operation:declare', reason: 'Declares archive.' },
				{ name: 'typegen:reference', reason: 'References archive input.' },
			] as const,
			version: '1.0.0',
			declare: ({ models, operations, typegenReferences }) => {
				typegenReferences.register(inputReference)
				operations.declare(archive)
				models.extend(Post, {
					contributionId: 'workflow-mutations',
					schemaMutations: {
						archive: { mutation: archive, surfaces: ['schema', 'model'] },
					},
				})
			},
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [Post],
		})
		const first = generateApplicationTypes({
			application,
			applicationId: 'fixture.schema-mutations',
		})
		const second = generateApplicationTypes({
			application,
			applicationId: 'fixture.schema-mutations',
		})

		expect(second).toStrictEqual(first)
		expect(first.snapshot.version).toBe(10)
		expect(first.snapshot.surfaces[0]?.schemaMutations[0]).toMatchObject({
			authority: 'request',
			effect: 'update',
			mutation: archive.name,
			name: 'archive',
			returning: 'after',
			select: ['workflowState'],
			version: '1.1.0',
		})
		expect(JSON.stringify(first.snapshot)).not.toContain('snapshot')
		expect(first.contents).toContain(
			'readonly archive: Core.ApplicationSchemaMutationMethod',
		)
		expect(first.contents).toContain(
			'readonly archive: Core.ApplicationModelSchemaMutationMethod',
		)
		expect(first.contents).toContain(
			'Core.PluginSchemaMutationDefinition<"fixture.workflow.archive", "1.1.0", Plugin0_BaseItem, readonly ["fixture.workflow.archive-rejected"], "request", "update", "after", Readonly<{ readonly workflowState: true }>>',
		)
	})
})
