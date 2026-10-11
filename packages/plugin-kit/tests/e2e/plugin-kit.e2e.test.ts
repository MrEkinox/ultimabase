import { UltimaBase, stringField } from '@ultimabase/core'
import {
	contributeDeclarations,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	plugin,
	defineTypegenReference,
} from '@ultimabase/core/plugin'
import {
	SchemaPatchBuilder,
	definePluginOptionsParser,
	patchSchemas,
	schemaPatch,
} from '@ultimabase/plugin-kit'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('packed @ultimabase/plugin-kit', () => {
	it('executes every public helper through compiled package exports', async () => {
		const parseOptions = definePluginOptionsParser({
			keys: ['enabled'] as const,
			name: 'packed plugin options',
			normalize: ({ enabled }) => ({ enabled: enabled === true }),
		})
		const normalized = parseOptions({ enabled: true })
		const parseStandardOptions = definePluginOptionsParser({
			name: 'packed Standard Schema options',
			schema: z.strictObject({
				enabled: z.boolean().default(true),
				mode: z.enum(['review', 'publish']).optional(),
			}),
		})
		const standardNormalized = parseStandardOptions({ mode: 'publish' })
		const echoInput = defineTypegenReference({
			exportName: 'EchoInput',
			module: '@fixture/packed-plugin',
		})
		const patch = schemaPatch().addField({
			contributionId: 'state',
			field: stringField(),
			name: 'state',
		})
		const text = defineOperationValue((value): string => String(value))
		const echo = defineOperation({
			input: text,
			name: 'fixture.packed-plugin.echo',
			result: text,
			target: 'application',
			transaction: 'forbidden',
			version: '1.0.0',
		})
		const operationContribution = contributeOperation({
			execute: ({ input }) => input,
			operation: echo,
		})
		const Target = UltimaBase.Schema.define({
			className: 'PackedPluginKitTarget',
			fields: (field) => ({ title: field.string() }),
		})
		const definition = plugin({
			id: 'fixture.packed-plugin',
			core: '^0.0.0',
			version: '1.0.0',
			contributions: [
				operationContribution,
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.patch(
							patchSchemas({
								patch,
								targets: schemas.select({ className: Target.className }),
							}),
						)
						return undefined
					},
				}),
			],
			permissions: {
				'operation:declare': 'Declares packed operation.',
				'schema:declare': 'Adds packed schema metadata.',
			},
		})
		const application = new (UltimaBase.use(definition))({
			logger: false,
			schemas: [Target],
		})

		application.compile()
		await application.initialize()

		expect(normalized).toStrictEqual({ enabled: true })
		expect(standardNormalized).toStrictEqual({
			enabled: true,
			mode: 'publish',
		})
		expect(Object.isFrozen(standardNormalized)).toBe(true)
		expect(patch).toBeInstanceOf(SchemaPatchBuilder)
		expect(Target.definition.fields).toHaveProperty('state')
		expect(echoInput).toMatchObject({
			exportName: 'EchoInput',
			module: '@fixture/packed-plugin',
		})
		expect(Object.isFrozen(definition)).toBe(true)

		await application.dispose()
	})
})
