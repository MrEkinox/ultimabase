import {
	FrameworkApplication,
	Schema,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	definePluginModule,
	defineTypegenReference,
	stringField,
} from '@ultimabase/core'
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
		const Target = Schema.define({
			className: 'PackedPluginKitTarget',
			fields: (field) => ({ title: field.string() }),
		})
		const module = definePluginModule({
			core: '^0.0.0',
			pluginId: 'fixture.packed-plugin',
			version: '1.0.0',
		})
		const plugin = module.plugin({
			operations: [operationContribution],
			declare: ({ schemas }) => {
				schemas.patch(
					patchSchemas({
						patch,
						targets: schemas.select({ className: Target.className }),
					}),
				)
			},
			privileges: [
				{ name: 'operation:declare', reason: 'Declares packed operation.' },
				{ name: 'schema:declare', reason: 'Adds packed schema metadata.' },
			] as const,
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [Target],
		})

		application.compileSchemas()
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
		expect(Object.isFrozen(module)).toBe(true)

		await application.dispose()
	})
})
