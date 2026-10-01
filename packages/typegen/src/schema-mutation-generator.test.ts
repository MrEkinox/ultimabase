import {
	UltimaBase,
	contributeDeclarations,
	defineOperationValue,
	plugin as createPlugin,
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
		const Post = UltimaBase.Schema.define({
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
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.schema-mutation-typegen',
			permissions: {
				'model:extend': 'Adds archive methods.',
				'operation:declare': 'Declares archive.',
				'typegen:reference': 'References archive input.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					models: ({ models }) => {
						models.extend(Post, {
							contributionId: 'workflow-mutations',
							schemaMutations: {
								archive: {
									mutation: archive,
									surfaces: ['schema', 'model'],
								},
							},
						})
					},
					operations: ({ operations }) => {
						operations.declare(archive)
					},
					typegen: ({ typegenReferences }) => {
						typegenReferences.register(inputReference)
					},
				}),
			],
		})
		const application = new (UltimaBase.use(plugin))({
			pluginPrivileges: { logger: false },
			schemas: [Post],
		})
		const first = generateApplicationTypes({
			ultimabase: application,
			applicationId: 'fixture.schema-mutations',
		})
		const second = generateApplicationTypes({
			ultimabase: application,
			applicationId: 'fixture.schema-mutations',
		})

		expect(second).toStrictEqual(first)
		expect(first.snapshot.version).toBe(11)
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
		expect(first.contents).toContain('readonly schemaClass: {')
		expect(first.contents).toContain(
			'Core.SchemaClass<Core.SchemaTypeInfoByNameOrBase<"TypegenSchemaMutationPost">>',
		)
		expect(first.contents).toContain(
			'readonly archive: Core.ApplicationModelSchemaMutationMethod',
		)
		expect(first.contents).toContain(
			'Core.PluginSchemaMutationDefinition<"fixture.workflow.archive", "1.1.0", Plugin0_BaseItem, readonly ["fixture.workflow.archive-rejected"], "request", "update", "after", Readonly<{ readonly workflowState: true }>>',
		)
		// All three callable surfaces share the complete callback descriptor.
		expect(
			first.contents.match(/Core\.PluginSchemaMutationDefinition</gu),
		).toHaveLength(1)
		expect(
			first.contents.match(
				/Core\.UltimaBaseGeneratedSchemaSurfaces\["TypegenSchemaMutationPost"\]\["schemaMutations"\]\["archive"\]/gu,
			),
		).toHaveLength(3)
	})
})
