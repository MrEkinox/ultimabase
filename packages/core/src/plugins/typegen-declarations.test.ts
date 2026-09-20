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
		],
		declare: ({ typegenReferences }) => {
			typegenReferences?.register(publicReference)
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

	it('captures only owner-scoped public references', () => {
		const application = new FrameworkApplication({
			plugins: [createContributor(), emitterProvider],
			schemas: [],
		})

		application.compileSchemas()

		const declaration = application.typegenGraph.declarations[0]
		expect(declaration?.references[0]?.reference).toBe(publicReference)
		expect(declaration?.references[0]?.owner).toMatchObject({
			pluginId: 'fixture.typegen-contributor',
			version: '2.1.0',
		})
		expect(Object.keys(declaration ?? {})).toEqual(['references'])
	})
})
