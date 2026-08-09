import { describe, expect, it } from 'vitest'

import {
	Schema,
	SchemaRegistry,
	defineFieldExtension,
	definePluginField,
	defineSchemaExtension,
} from '../schema/index.js'
import {
	defineFieldKindAccessTarget,
	getResolvedPluginAccessContribution,
	isPluginAccessTargetDefinition,
} from './access-targets.js'
import { PluginSetupRegistries } from './setup-registries.js'

const ownerPlugin = 'fixture.access-owner'
const schemaExtension = defineSchemaExtension(
	'fixture.schema-access',
	{ enabled: true },
	ownerPlugin,
)
const fieldExtension = defineFieldExtension(
	'fixture.field-access',
	{ enabled: true },
	ownerPlugin,
)
const vectorField = definePluginField(
	'fixture.access-vector',
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
const vectorKindTarget = defineFieldKindAccessTarget<typeof vectorField>(
	'fixture.access-vector',
)
const primarySchema = Schema.define({
	className: 'PluginAccessTarget',
	fields: (field) => ({
		'dotted.name': field.string({ extensions: [fieldExtension] }),
		profile: field.object({
			fields: (field) => ({
				email: field.string({ extensions: [fieldExtension] }),
			}),
		}),
		vector: vectorField,
	}),
	extensions: [schemaExtension],
})
const secondarySchema = Schema.define({
	className: 'SecondaryPluginAccessTarget',
	fields: (field) => ({ title: field.string() }),
})

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

const captureError = (operation: () => unknown): unknown => {
	try {
		operation()
	} catch (error: unknown) {
		return error
	}

	throw new Error('Expected operation to throw')
}

const resolvedContributions = (registries: PluginSetupRegistries) => {
	registries.closeSetup()
	registries.resolveAccessTargets()

	return registries
		.getContributions('access')
		.map(({ value }) => getResolvedPluginAccessContribution(value))
		.filter((value) => value !== undefined)
}

describe('plugin Access targets', () => {
	it('resolves all six targets with exact provenance and master behavior', () => {
		const registries = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema, secondarySchema]),
		)
		const { access } = registries.forPlugin(ownerPlugin)
		const extensionPaths: (readonly string[])[] = []

		access.global('global', { read: true }, { master: 'bypass' })
		access.schema(
			'schema',
			primarySchema,
			{ read: { where: {} } },
			{ master: 'enforce' },
		)
		access.field(
			'field',
			primarySchema,
			['dotted.name'],
			{ read: false },
			{ master: 'enforce' },
		)
		access.schemaExtension(
			'schema-extension',
			schemaExtension,
			({ schema }) => {
				expect(schema).toBe(primarySchema)

				return { delete: false }
			},
			{ master: 'enforce' },
		)
		access.fieldExtension(
			'field-extension',
			fieldExtension,
			({ path }) => {
				extensionPaths.push(path)

				return { write: false }
			},
			{ master: 'bypass' },
		)
		access.fieldKind(
			'field-kind',
			vectorKindTarget,
			({ field }) => {
				expect(field).toBe(vectorField)

				return { write: true }
			},
			{ master: 'enforce' },
		)

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
		expect(byName.get('global')?.master).toBe('bypass')
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
		}
	})

	it('rejects foreign schemas, extensions, forged targets, and late writes', () => {
		const foreignSchema = Schema.define({
			className: primarySchema.className,
			fields: (field) => ({ title: field.string() }),
		})
		const registries = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)
		const access = registries.forPlugin(ownerPlugin).access

		access.schema(
			'foreign-schema',
			foreignSchema,
			{ read: true },
			{ master: 'enforce' },
		)
		registries.closeSetup()

		expect(
			captureError(() => {
				registries.resolveAccessTargets()
			}),
		).toMatchObject({
			code: 'PLUGIN_CONFLICT',
			internalDetails: {
				kind: 'foreign-access-schema',
			},
		})
		expect(() => {
			access.global('late', { read: true }, { master: 'enforce' })
		}).toThrow(
			new TypeError('Plugin Access can only be registered during setup'),
		)

		const foreign = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		).forPlugin('fixture.foreign').access

		expect(
			captureError(() => {
				foreign.schemaExtension(
					'foreign-extension',
					schemaExtension,
					() => ({ read: true }),
					{ master: 'enforce' },
				)
			}),
		).toMatchObject({
			code: 'PLUGIN_CONFLICT',
			internalDetails: {
				kind: 'foreign-access-extension',
			},
		})

		const kindRegistries = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)
		expect(() =>
			invokeMethod(kindRegistries.forPlugin(ownerPlugin).access, 'fieldKind', [
				'forged-kind',
				{ kind: 'fixture.access-vector' },
				() => ({ create: true }),
				{ master: 'enforce' },
			]),
		).toThrow(
			new TypeError(
				'Field-kind Access target must be created by defineFieldKindAccessTarget',
			),
		)
	})

	it('rejects empty, duplicate, malformed, and forged contributions', () => {
		const registries = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)
		const access = registries.forPlugin(ownerPlugin).access

		expect(() => {
			access.global('empty', {}, { master: 'enforce' })
		}).toThrow(
			new TypeError(
				'Plugin Access contribution "empty" must declare a schema rule',
			),
		)
		expect(() =>
			invokeMethod(access, 'global', [
				'invalid-master',
				{ read: true },
				{ master: 'allow' },
			]),
		).toThrow(
			new TypeError(
				'Plugin Access options.master must be "bypass" or "enforce"',
			),
		)

		access.global('duplicate', { read: true }, { master: 'enforce' })
		expect(
			captureError(() => {
				access.schema(
					'duplicate',
					primarySchema,
					{ read: true },
					{ master: 'enforce' },
				)
			}),
		).toMatchObject({
			code: 'PLUGIN_CONFLICT',
			internalDetails: {
				kind: 'duplicate-plugin-local-contribution',
			},
		})

		const forged = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)
		forged.access.forPlugin(ownerPlugin).register('forged', {
			master: 'enforce',
			targetKind: 'global',
		})
		forged.closeSetup()
		expect(() => {
			forged.resolveAccessTargets()
		}).toThrow(new TypeError('Plugin Access contribution "forged" is forged'))
	})

	it('brands only definitions produced by the typed setup facade', () => {
		const registries = new PluginSetupRegistries(
			new SchemaRegistry([primarySchema]),
		)
		const access = registries.forPlugin(ownerPlugin).access

		access.global('branded', { read: true }, { master: 'enforce' })
		const value = registries.getContributions('access')[0]?.value

		expect(isPluginAccessTargetDefinition(value)).toBe(true)
		expect(
			isPluginAccessTargetDefinition({
				master: 'enforce',
				targetKind: 'global',
			}),
		).toBe(false)
	})
})
