import {
	FrameworkApplication,
	Schema,
	defineOperation,
	defineOperationValue,
	stringField,
} from '@ultimabase/core'
import {
	SchemaPatchBuilder,
	definePluginModule,
	definePluginOptionsParser,
	defineTypegenModule,
	patchSchemas,
	providePluginOperation,
	schemaPatch,
} from '@ultimabase/plugin-kit'
import { describe, expect, it } from 'vitest'

describe('packed @ultimabase/plugin-kit', () => {
	it('executes every public helper through compiled package exports', async () => {
		const parseOptions = definePluginOptionsParser({
			keys: ['enabled'] as const,
			name: 'packed plugin options',
			normalize: ({ enabled }) => ({ enabled: enabled === true }),
		})
		const normalized = parseOptions({ enabled: true })
		const types = defineTypegenModule('@fixture/packed-plugin')
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
		const operationProvider = providePluginOperation({
			contributionId: 'echo',
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
			capabilities: { provides: [operationProvider] },
			declare: ({ operations, schemas }) => {
				operations.declare(echo)
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
		expect(patch).toBeInstanceOf(SchemaPatchBuilder)
		expect(Target.definition.fields).toHaveProperty('state')
		expect(types.reference('EchoInput')).toMatchObject({
			exportName: 'EchoInput',
			module: '@fixture/packed-plugin',
		})
		expect(Object.isFrozen(module)).toBe(true)

		await application.dispose()
	})
})
