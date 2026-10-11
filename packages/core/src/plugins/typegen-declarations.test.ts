import { describe, expect, it } from 'vitest'
import { FrameworkApplication } from '../application/framework-application.js'

import {
	defineOperation,
	defineOperationValue,
	plugin as createPlugin,
	contributeDeclarations,
	defineTypegenReference,
} from '../index.js'

const publicReference = defineTypegenReference({
	exportName: 'WorkflowState',
	module: '@fixture/workflow-plugin',
})

const createContributor = () =>
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.typegen-contributor',
		version: '2.1.0',
		permissions: {
			'typegen:reference': 'References the public workflow state.',
		},
		contributions: [
			contributeDeclarations({
				typegen: ({ typegenReferences }) => {
					typegenReferences.register(publicReference)

					return undefined
				},
			}),
		],
	})

describe('Typegen declaration facades', () => {
	it('rejects denied reference privileges without requiring a generator', () => {
		// Direct reference declarations still pass the ordinary privilege boundary.
		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { deny: ['typegen:reference'] },
					logger: false,
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

	it('collects command references once from the owned operation contract', () => {
		const value = defineOperationValue((input) => input, publicReference)
		const operation = defineOperation({
			input: value,
			name: 'fixture.typegen.operation',
			result: value,
			target: 'application',
			transaction: 'forbidden',
			version: '1.0.0',
		})
		const application = new FrameworkApplication({
			plugins: [
				createPlugin({
					core: '^0.0.0',
					id: 'fixture.typegen-operation',
					version: '1.0.0',
					permissions: {
						'operation:declare': 'Declares the typed operation.',
						'typegen:reference': 'References the public workflow state.',
					},
					contributions: [
						contributeDeclarations({
							operations: ({ operations }) => {
								operations.declare(operation)
								return undefined
							},
							typegen: ({ typegenReferences }) => {
								typegenReferences.register(publicReference)
								return undefined
							},
						}),
					],
				}),
			],
			schemas: [],
		})

		application.compileSchemas()

		const references = application.typegenGraph.declarations.flatMap(
			(declaration) => declaration.references,
		)
		expect(references).toHaveLength(1)
		expect(references[0]?.reference).toBe(publicReference)
		expect(references[0]?.owner.pluginId).toBe('fixture.typegen-operation')
	})
})
