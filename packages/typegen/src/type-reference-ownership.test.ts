import {
	UltimaBase,
	defineOperation,
	defineOperationValue,
	plugin,
	contributeDeclarations,
	defineTypegenReference,
} from '@ultimabase/core'
import { expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

it.each(['missing', 'foreign', 'owner'] as const)(
	'validates %s registration of a consumed public type reference',
	(registration) => {
		const reference = defineTypegenReference({
			module: '@fixture/types-plugin',
			exportName: 'Value',
		})
		const value = defineOperationValue((input) => input, reference)
		const operation = defineOperation({
			input: value,
			result: value,
			name: 'fixture.reference.operation',
			target: 'application',
			transaction: 'forbidden',
			version: '1.0.0',
		})
		const owner = plugin({
			core: '^0.0.0',
			id: 'fixture.reference-owner',
			version: '1.0.0',
			permissions: {
				'operation:declare': 'Declares a typed operation.',
				...(registration === 'owner'
					? {
							'typegen:reference':
								'Owns the public type used by its operation.',
						}
					: {}),
			},
			contributions: [
				contributeDeclarations({
					operations: ({ operations }) => {
						operations.declare(operation)
						return undefined
					},
				}),
				...(registration === 'owner'
					? [
							contributeDeclarations({
								typegen: ({ typegenReferences }) => {
									typegenReferences.register(reference)
									return undefined
								},
							}),
						]
					: []),
			],
		})
		const foreign = plugin({
			core: '^0.0.0',
			id: 'fixture.foreign-reference',
			version: '1.0.0',
			permissions: {
				'typegen:reference': 'Exercises exact reference ownership.',
			},
			contributions: [
				contributeDeclarations({
					typegen: ({ typegenReferences }) => {
						if (registration === 'foreign')
							typegenReferences.register(reference)

						return undefined
					},
				}),
			],
		})
		const application = new (UltimaBase.use(owner, foreign))({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		const generate = () =>
			generateApplicationTypes({
				ultimabase: application,
				applicationId: 'reference-ownership',
			})
		// The same nominal token registered by another owner grants no import authority.
		if (registration !== 'owner')
			expect(generate).toThrow('not registered by its owner')
		else expect(generate().contents).toContain('from "@fixture/types-plugin"')
	},
)
