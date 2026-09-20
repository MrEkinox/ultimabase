import {
	FrameworkApplication,
	defineOperation,
	defineOperationValue,
	definePlugin,
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
		const owner = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.reference-owner',
			version: '1.0.0',
			privileges: [
				{ name: 'operation:declare', reason: 'Declares a typed operation.' },
				{ name: 'typegen:reference', reason: 'Registers its public type.' },
			],
			declare: ({ operations, typegenReferences }) => {
				operations.declare(operation)
				if (registration === 'owner') typegenReferences.register(reference)
			},
		})
		const foreign = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.foreign-reference',
			version: '1.0.0',
			privileges: [
				{
					name: 'typegen:reference',
					reason: 'Exercises exact reference ownership.',
				},
			],
			declare: ({ typegenReferences }) => {
				if (registration === 'foreign') typegenReferences.register(reference)
			},
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [owner, foreign],
			schemas: [],
		})
		const generate = () =>
			generateApplicationTypes({
				application,
				applicationId: 'reference-ownership',
			})
		// The same nominal token registered by another owner grants no import authority.
		if (registration !== 'owner')
			expect(generate).toThrow('not registered by its owner')
		else expect(generate().contents).toContain('from "@fixture/types-plugin"')
	},
)
