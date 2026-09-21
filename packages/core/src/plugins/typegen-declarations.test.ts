import { describe, expect, it } from 'vitest'

import {
	FrameworkApplication,
	definePlugin,
	defineTypegenReference,
} from '../index.js'

const publicReference = defineTypegenReference({
	exportName: 'WorkflowState',
	module: '@fixture/workflow-plugin',
})

const createContributor = () =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.typegen-contributor',
		version: '2.1.0',
		privileges: [
			{
				name: 'typegen:reference',
				reason: 'References the public workflow state.',
			},
		],
		declare: ({ typegenReferences }) => {
			typegenReferences.register(publicReference)
		},
	})

describe('Typegen declaration facades', () => {
	it('rejects denied reference privileges without requiring a generator', () => {
		// Direct reference declarations still pass the ordinary privilege boundary.
		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { deny: ['typegen:reference'], logger: false },
					plugins: [createContributor()],
					schemas: [],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_PRIVILEGE_DENIED' }))
	})

	it('captures owner-scoped public references without installing a generator', () => {
		const application = new FrameworkApplication({
			plugins: [createContributor()],
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
