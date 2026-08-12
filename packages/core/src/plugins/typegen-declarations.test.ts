import { describe, expect, it } from 'vitest'

import {
	FrameworkApplication,
	definePlugin,
	defineTypegenReference,
	optionalCapability,
	provideCapability,
	typegenEmitterCapability,
} from '../index.js'

const emitterRequirement = optionalCapability(
	typegenEmitterCapability,
	'^1.0.0',
)
const publicReference = defineTypegenReference({
	exportName: 'WorkflowState',
	module: '@fixture/workflow-plugin',
})

const createContributor = () =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.typegen-contributor',
		version: '2.1.0',
		capabilities: { optional: [emitterRequirement] },
		privileges: [
			{
				name: 'typegen:reference',
				reason: 'References the public workflow state.',
				when: emitterRequirement,
			},
			{
				name: 'typegen:contribute',
				reason: 'Adds the workflow declaration.',
				when: emitterRequirement,
			},
			{
				name: 'typegen:emit',
				reason: 'Emits inert workflow metadata.',
				when: emitterRequirement,
			},
		],
		declare: ({ typegenContributions, typegenOutputs, typegenReferences }) => {
			typegenReferences?.register(publicReference)
			typegenContributions?.add({
				contributionId: 'workflow-contract',
				declarations: [
					{
						kind: 'type',
						name: 'ConfiguredWorkflow',
						type: { kind: 'reference', reference: publicReference },
					},
				],
				staticOptions: { workflowName: 'editorial' },
			})
			typegenOutputs?.emit({
				contributionId: 'workflow-metadata',
				kind: 'metadata',
				metadata: { workflowName: 'editorial' },
				outputPath: 'workflow.generated.json',
			})
		},
	})

const emitterProvider = definePlugin({
	core: '^0.0.0',
	pluginId: 'fixture.typegen-emitter',
	version: '1.0.0',
	capabilities: {
		provides: [
			provideCapability(typegenEmitterCapability, {
				contributionId: 'fixture',
				value: { kind: 'typegen-emitter' },
			}),
		],
	},
})

describe('Typegen declaration facades', () => {
	it('keeps conditional declarations absent without an emitter capability', () => {
		const application = new FrameworkApplication({
			plugins: [createContributor()],
			schemas: [],
		})

		application.compileSchemas()

		expect(application.typegenGraph.declarations).toStrictEqual([])
	})

	it('captures references, declarations, outputs, owner version, and static options', () => {
		const application = new FrameworkApplication({
			plugins: [createContributor(), emitterProvider],
			schemas: [],
		})

		application.compileSchemas()

		const declaration = application.typegenGraph.declarations[0]
		expect(declaration?.references[0]?.reference).toBe(publicReference)
		expect(declaration?.contributions[0]).toMatchObject({
			contributionId: 'workflow-contract',
			owner: { pluginId: 'fixture.typegen-contributor', version: '2.1.0' },
			staticOptions: { workflowName: 'editorial' },
		})
		expect(declaration?.outputs[0]).toMatchObject({
			kind: 'metadata',
			outputPath: 'workflow.generated.json',
		})
	})

	it('rejects unregistered references and executable or sensitive output shapes', () => {
		const invalid = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.invalid-typegen',
			version: '1.0.0',
			privileges: [
				{ name: 'typegen:contribute', reason: 'Invalid fixture.' },
				{ name: 'typegen:emit', reason: 'Invalid fixture.' },
			],
			declare: ({ typegenContributions }) => {
				typegenContributions.add({
					contributionId: 'invalid',
					declarations: [
						{
							kind: 'type',
							name: 'InvalidReference',
							type: { kind: 'reference', reference: publicReference },
						},
					],
				})
			},
		})
		const application = new FrameworkApplication({
			plugins: [invalid],
			schemas: [],
		})

		expect(() => application.compileSchemas()).toThrow(
			'unregistered Typegen reference',
		)

		const sensitive = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.sensitive-typegen',
			version: '1.0.0',
			privileges: [{ name: 'typegen:emit', reason: 'Invalid fixture.' }],
			declare: ({ typegenOutputs }) => {
				typegenOutputs.emit({
					contributionId: 'secret',
					kind: 'metadata',
					metadata: { apiKey: 'must-not-be-emitted' },
					outputPath: 'secret.json',
				})
			},
		})

		expect(() =>
			new FrameworkApplication({
				plugins: [sensitive],
				schemas: [],
			}).compileSchemas(),
		).toThrow('prohibited sensitive key')
	})
})
