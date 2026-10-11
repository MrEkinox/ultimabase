import { describe, expect, it } from 'vitest'

import { Schema, UltimaBase, type SchemaDefinition } from '../index.js'
import {
	plugin,
	provideSchemaFactories,
	provideSchemaShapeMethods,
	type PluginSchemaFactoriesSource,
	type PluginSchemaShapeSource,
	type SchemaFactoriesHKT,
	type SchemaShapeMethod,
} from '../plugin.js'
import { readSchemaFactories } from './schema-factories.js'

// ADR-0322: plugins add schema factories (`App.RoleSchema`) to the configured
// application; Core never names them.
interface NoteFactoryMembers {
	readonly NoteSchema: Readonly<{ define: (options: object) => unknown }>
}
interface NoteFactories extends SchemaFactoriesHKT {
	readonly factories: NoteFactoryMembers
}

const createNotePlugin = (id = 'fixture.factories.notes') => {
	const instance = plugin<
		string,
		undefined,
		string,
		'^0.0.0',
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		readonly [],
		PluginSchemaFactoriesSource<NoteFactories>
	>({ id, version: '1.0.0', core: '^0.0.0', contributions: [] })
	return provideSchemaFactories(instance, {
		NoteSchema: ({ define }) => ({
			define: (options: object) =>
				define(options, (schema: SchemaDefinition) => ({
					describe: () => `note ${schema.className}`,
				})),
		}),
	})
}

const fields = () => ({})

describe('schema factories', () => {
	it('attaches each factory to the configured application with its statics', () => {
		const App = UltimaBase.use(createNotePlugin())
		const declared = App.NoteSchema.define({
			className: 'FactoryNote',
			fields,
		})

		expect(Object.isFrozen(App.NoteSchema)).toBe(true)
		expect('NoteSchema' in UltimaBase).toBe(false)
		expect(Schema.is(declared)).toBe(true)
		// The chain keeps the statics through `.with(...)`.
		const final: unknown = Reflect.apply(
			Reflect.get(declared as object, 'with') as (rules: object) => unknown,
			declared,
			[{}],
		)
		expect(Schema.is(final)).toBe(true)
		expect(
			Reflect.apply(
				Reflect.get(final as object, 'describe') as () => string,
				final,
				[],
			),
		).toBe('note FactoryNote')
	})

	it('rebinds inherited factories to the shape methods of a child factory', () => {
		type FlagSource = PluginSchemaShapeSource<{
			readonly flag: SchemaShapeMethod<readonly [], Readonly<{ flag: object }>>
		}>
		const flags = provideSchemaShapeMethods<
			ReturnType<typeof plugin>,
			FlagSource
		>(
			plugin({
				id: 'fixture.factories.flags',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [],
			}),
			{ flag: { sets: ['flag'], apply: () => ({ flag: {} }) } },
		)
		const Parent = UltimaBase.use(createNotePlugin())
		const Child = Parent.use(flags)
		const declared = Child.NoteSchema.define({
			className: 'FactoryFlaggedNote',
			fields,
		})

		expect(Child.NoteSchema).not.toBe(Parent.NoteSchema)
		expect(typeof Reflect.get(declared as object, 'flag')).toBe('function')
		expect(
			typeof Reflect.get(
				Parent.NoteSchema.define({ className: 'FactoryPlainNote', fields }) as object,
				'flag',
			),
		).toBe('undefined')
	})

	it('validates factory names, results and conflicts', () => {
		const bare = () =>
			plugin({
				id: 'fixture.factories.invalid',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [],
			})
		expect(() =>
			provideSchemaFactories(bare(), { Schema: () => ({}) } as never),
		).toThrow(new TypeError('Invalid schema factory name: Schema'))
		expect(() =>
			provideSchemaFactories(bare(), { noteSchema: () => ({}) } as never),
		).toThrow(new TypeError('Invalid schema factory name: noteSchema'))
		expect(() =>
			provideSchemaFactories(bare(), { NoteSchema: {} } as never),
		).toThrow(new TypeError('schema factory NoteSchema must be a function'))
		expect(() =>
			UltimaBase.use(
				provideSchemaFactories(bare(), { NoteSchema: () => 1 } as never),
			),
		).toThrow(new TypeError('schema factory NoteSchema must return an object'))
		expect(() =>
			readSchemaFactories([
				createNotePlugin('fixture.factories.first'),
				createNotePlugin('fixture.factories.second'),
			]),
		).toThrow(new TypeError('Conflicting schema factory: NoteSchema'))
		const first = createNotePlugin()
		expect([
			...readSchemaFactories([first, createNotePlugin()]).keys(),
		]).toStrictEqual(['NoteSchema'])
	})
})
