import { describe, expect, it } from 'vitest'

import { createApplication } from '../application/framework-application.js'
import { beforeOperation } from '../runtime/hooks/definitions.js'
import { createRuntimeHookStages } from '../runtime/hooks/stages.js'
import {
	defineFieldExtension,
	definePluginField,
	defineSchemaExtension,
	objectField,
	Schema,
	SchemaRegistry,
	stringField,
} from '../schema/index.js'
import { definePlugin } from './definition.js'
import {
	defineFieldKindHookTarget,
	getResolvedPluginHookContribution,
	isPluginHookTargetDefinition,
} from './hook-targets.js'
import { PluginSetupRegistries } from './setup-registries.js'

const ownerPlugin = 'fixture.hook-owner'
const schemaExtension = defineSchemaExtension(
	'fixture.schema-hooks',
	{ enabled: true },
	ownerPlugin,
)
const fieldExtension = defineFieldExtension(
	'fixture.field-hooks',
	{ enabled: true },
	ownerPlugin,
)
const vectorField = definePluginField(
	'fixture.vector',
	{},
	{
		snapshotValue: (value: unknown): readonly number[] => {
			if (
				!Array.isArray(value) ||
				!value.every((item: unknown) => typeof item === 'number')
			) {
				throw new TypeError('vector must contain numbers')
			}

			return value
		},
	},
)
const vectorKindTarget =
	defineFieldKindHookTarget<typeof vectorField>('fixture.vector')

const captureError = (operation: () => unknown): unknown => {
	try {
		operation()
	} catch (error: unknown) {
		return error
	}

	throw new Error('Expected operation to throw')
}

const invokeMethod = (
	target: object,
	name: string,
	arguments_: readonly unknown[],
): unknown => {
	const method: unknown = Reflect.get(target, name)

	if (typeof method !== 'function') {
		throw new TypeError(`${name} must be a function`)
	}

	return Reflect.apply(method, target, arguments_)
}

const primarySchema = Schema.define({
	className: 'PluginHookTarget',
	fields: {
		'dotted.name': stringField({ extensions: [fieldExtension] }),
		profile: objectField({
			list: true,
			fields: {
				email: stringField({ extensions: [fieldExtension] }),
			},
		}),
		vector: vectorField,
	},
	extensions: [schemaExtension],
})

const secondarySchema = Schema.define({
	className: 'SecondaryPluginHookTarget',
	fields: { title: stringField() },
})

const resolvedContributions = (registries: PluginSetupRegistries) => {
	registries.closeSetup()
	registries.resolveHookTargets()

	return registries
		.getContributions('hooks')
		.map(({ value }) => getResolvedPluginHookContribution(value))
		.filter((value) => value !== undefined)
}

describe('plugin hook targets', () => {
	it('resolves all six targets with immutable exact matches', () => {
		const registries = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema, secondarySchema]),
		)
		const { hooks } = registries.forPlugin(ownerPlugin)
		const extensionPaths: (readonly string[])[] = []

		hooks.global('global', {
			beforeOperation: { create: ({ item }) => void item },
		})
		hooks.schema('schema', primarySchema, {
			beforeOperation: { create: ({ item }) => void item },
		})
		hooks.field('field', primarySchema, ['dotted.name'], {
			resolveInput: ({ value }) => value,
		})
		hooks.schemaExtension(
			'schema-extension',
			schemaExtension,
			({ schema }) => ({
				beforeOperation: {
					create: () => {
						expect(schema).toBe(primarySchema)
					},
				},
			}),
		)
		hooks.fieldExtension('field-extension', fieldExtension, ({ path }) => {
			extensionPaths.push(path)

			return { resolveInput: ({ value }) => value }
		})
		hooks.fieldKind('field-kind', vectorKindTarget, ({ field }) => ({
			resolveInput: ({ value }) => {
				expect(field).toBe(vectorField)

				return value
			},
		}))

		const resolved = resolvedContributions(registries)
		const byName = new Map(resolved.map((entry) => [entry.localName, entry]))

		expect(resolved.map(({ targetKind }) => targetKind)).toStrictEqual([
			'global',
			'schema',
			'field',
			'schema-extension',
			'field-extension',
			'field-kind',
		])
		expect(
			byName.get('global')?.schemas.map(({ schema }) => schema),
		).toStrictEqual([primarySchema, secondarySchema])
		expect(byName.get('schema')?.schemas[0]?.schema).toBe(primarySchema)
		expect(byName.get('field')?.fields[0]).toMatchObject({
			field: primarySchema.fields['dotted.name'],
			path: ['dotted.name'],
			schema: primarySchema,
		})
		expect(byName.get('schema-extension')?.schemas).toHaveLength(1)
		expect(
			byName.get('field-extension')?.fields.map(({ path }) => path),
		).toStrictEqual([['dotted.name'], ['profile', 'email']])
		expect(byName.get('field-kind')?.fields[0]?.field).toBe(vectorField)
		expect(extensionPaths).toStrictEqual([
			['dotted.name'],
			['profile', 'email'],
		])

		for (const contribution of resolved) {
			expect(Object.isFrozen(contribution)).toBe(true)
			expect(Object.isFrozen(contribution.schemas)).toBe(true)
			expect(Object.isFrozen(contribution.fields)).toBe(true)
			expect(contribution.schemas.every(Object.isFrozen)).toBe(true)
			expect(contribution.fields.every(Object.isFrozen)).toBe(true)
			expect(
				contribution.fields.every(({ path }) => Object.isFrozen(path)),
			).toBe(true)
		}
	})

	it('requires exact application schema identity', () => {
		const foreignSchema = Schema.define({
			className: primarySchema.className,
			fields: { title: stringField() },
		})
		const registries = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)

		registries.forPlugin(ownerPlugin).hooks.schema('foreign', foreignSchema, {
			beforeOperation: { create: ({ item }) => void item },
		})
		registries.closeSetup()

		expect(
			captureError(() => {
				registries.resolveHookTargets()
			}),
		).toMatchObject({
			code: 'PLUGIN_CONFLICT',
			internalDetails: { kind: 'foreign-hook-schema' },
		})
	})

	it('preserves dotted segments and rejects invalid field paths', () => {
		const valid = new PluginSetupRegistries(new SchemaRegistry([primarySchema]))

		valid
			.forPlugin(ownerPlugin)
			.hooks.field('dotted', primarySchema, ['dotted.name'], {
				resolveInput: ({ value }) => value,
			})
		expect(resolvedContributions(valid)[0]?.fields[0]?.path).toStrictEqual([
			'dotted.name',
		])

		const invalid = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)
		invokeMethod(invalid.forPlugin(ownerPlugin).hooks, 'field', [
			'split-dot',
			primarySchema,
			['dotted', 'name'],
			{
				resolveInput: ({ value }: { readonly value: unknown }) => value,
			},
		])
		invalid.closeSetup()

		expect(
			captureError(() => {
				invalid.resolveHookTargets()
			}),
		).toMatchObject({
			code: 'PLUGIN_CONFLICT',
			internalDetails: {
				kind: 'invalid-hook-field-path',
				path: ['dotted', 'name'],
			},
		})
	})

	it('rejects foreign extensions and malformed kind selectors or factories', () => {
		const registries = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)
		const foreign = registries.forPlugin('fixture.foreign').hooks

		expect(
			captureError(() => {
				foreign.schemaExtension('foreign-extension', schemaExtension, () => ({
					beforeOperation: { create: ({ item }) => void item },
				}))
			}),
		).toMatchObject({
			code: 'PLUGIN_CONFLICT',
			internalDetails: { kind: 'foreign-hook-extension' },
		})

		const hooks = registries.forPlugin(ownerPlugin).hooks
		expect(() => {
			invokeMethod(hooks, 'fieldKind', [
				'forged-kind',
				{ kind: 'fixture.vector' },
				() => ({
					resolveInput: ({ value }: { readonly value: unknown }) => value,
				}),
			])
		}).toThrow(
			new TypeError(
				'Field-kind hook target must be created by defineFieldKindHookTarget',
			),
		)
		expect(() => {
			defineFieldKindHookTarget<typeof vectorField>(
				'string' as 'fixture.vector',
			)
		}).toThrow()
		expect(() => {
			invokeMethod(hooks, 'fieldKind', [
				'invalid-factory',
				vectorKindTarget,
				false,
			])
		}).toThrow(new TypeError('Field-kind hook factory must be a function'))
	})

	it('rejects empty declarations and empty factory results', () => {
		const direct = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)

		expect(() => {
			direct.forPlugin(ownerPlugin).hooks.global('empty', {})
		}).toThrow(
			new TypeError('Plugin hook contribution "empty" must declare a hook'),
		)

		const factory = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)
		factory
			.forPlugin(ownerPlugin)
			.hooks.schemaExtension('empty-factory', schemaExtension, () => ({}))
		factory.closeSetup()

		expect(() => {
			factory.resolveHookTargets()
		}).toThrow(
			new TypeError(
				'Plugin hook contribution "empty-factory" must declare a hook',
			),
		)
	})

	it('uses owner-local identities while allowing the same name across plugins', () => {
		const registries = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)
		const first = registries.forPlugin('fixture.first').hooks
		const second = registries.forPlugin('fixture.second').hooks

		first.global('shared', {
			beforeOperation: { create: ({ item }) => void item },
		})
		expect(
			captureError(() => {
				first.schema('shared', primarySchema, {
					beforeOperation: { create: ({ item }) => void item },
				})
			}),
		).toMatchObject({
			code: 'PLUGIN_CONFLICT',
			internalDetails: { kind: 'duplicate-plugin-local-contribution' },
		})
		second.global('shared', {
			beforeOperation: { create: ({ item }) => void item },
		})

		expect(
			resolvedContributions(registries).map(({ ownerPlugin }) => ownerPlugin),
		).toStrictEqual(['fixture.first', 'fixture.second'])
	})

	it('closes typed registration after setup, including lifecycle hooks', async () => {
		const registries = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)
		const hooks = registries.forPlugin(ownerPlugin).hooks

		registries.closeSetup()
		expect(() => {
			hooks.global('late', {
				beforeOperation: { create: ({ item }) => void item },
			})
		}).toThrow(
			new TypeError('Plugin hooks can only be registered during setup'),
		)

		const plugin = definePlugin({
			name: 'fixture.late-lifecycle',
			hooks: {
				connect: ({ hooks: lifecycleHooks }) => {
					lifecycleHooks.global('too-late', {
						beforeOperation: { create: ({ item }) => void item },
					})
				},
			},
		})
		const application = await createApplication({
			schemas: [secondarySchema],
			plugins: [plugin],
		})

		await expect(application.start()).rejects.toThrow(
			new TypeError('Plugin hooks can only be registered during setup'),
		)
	})

	it('preserves graph, configuration, and registration order', async () => {
		const createOrderedPlugin = (
			name: string,
			dependencies?: readonly string[],
		) =>
			definePlugin({
				name,
				dependencies,
				setup: ({ hooks }) => {
					hooks.global('first', {
						beforeOperation: { create: ({ item }) => void item },
					})
					hooks.global('second', {
						beforeOperation: { create: ({ item }) => void item },
					})
				},
			})
		const base = createOrderedPlugin('fixture.order-base')
		const first = createOrderedPlugin('fixture.order-first', [base.name])
		const second = createOrderedPlugin('fixture.order-second', [base.name])
		const independent = createOrderedPlugin('fixture.order-independent')
		const application = await createApplication({
			schemas: [secondarySchema],
			plugins: [first, independent, second, base],
		})

		expect(
			application
				.getContributions('hooks')
				.map(({ name, ownerPlugin: owner }) => `${owner}:${name}`),
		).toStrictEqual([
			'fixture.order-independent:first',
			'fixture.order-independent:second',
			'fixture.order-base:first',
			'fixture.order-base:second',
			'fixture.order-first:first',
			'fixture.order-first:second',
			'fixture.order-second:first',
			'fixture.order-second:second',
		])
	})

	it('keeps applications isolated and coexists with ADR-0070 hooks', async () => {
		const plugin = definePlugin({
			name: 'fixture.coexisting-hooks',
			setup: ({ hooks, registries }) => {
				hooks.global('native', {
					beforeOperation: { create: ({ item }) => void item },
				})
				registries.hooks.register(
					'fixture.low-level',
					beforeOperation({ handler: ({ operation }) => ({ operation }) }),
				)
			},
		})
		const first = await createApplication({
			schemas: [secondarySchema],
			plugins: [plugin],
		})
		const second = await createApplication({
			schemas: [secondarySchema],
			plugins: [plugin],
		})
		const firstContributions = first.getContributions('hooks')
		const secondContributions = second.getContributions('hooks')

		expect(firstContributions.map(({ name }) => name)).toStrictEqual([
			'native',
			'fixture.low-level',
		])
		expect(firstContributions).not.toBe(secondContributions)
		expect(firstContributions[0]?.value).not.toBe(secondContributions[0]?.value)
		expect(isPluginHookTargetDefinition(firstContributions[0]?.value)).toBe(
			true,
		)
		expect(
			getResolvedPluginHookContribution(firstContributions[0]?.value),
		).toBeDefined()
		expect(
			getResolvedPluginHookContribution(firstContributions[1]?.value),
		).toBeUndefined()
		expect(() => createRuntimeHookStages(first)).not.toThrow()
	})
})
