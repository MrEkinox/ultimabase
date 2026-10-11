import { expectTypeOf, test } from 'vitest'

import {
	UltimaBase,
	type DeclaredSchema,
	type FieldUpdateInputCarrier,
	type PluginFieldDefinition,
	type SchemaDefinition,
} from '../index.js'
import type {
	plugin,
	DeclaredSchemaShape,
	PluginSchemaFactoriesSource,
	PluginSchemaFieldsSource,
	PluginSchemaRulesSource,
	PluginSchemaShapeSource,
	PluginSchemaStaticsSource,
	PluginSourceState,
	SchemaFactoriesHKT,
	SchemaFactoryShape,
	SchemaFieldsHKT,
	SchemaRulesHKT,
	SchemaShapeMethod,
	SchemaStaticsHKT,
} from '../plugin.js'

// ADR-0322: a factory slot adds `App.NoteSchema`; its declarations carry a
// shape record the plugin's statics slot recognizes.
interface NoteFactory<TSource extends PluginSourceState> {
	define<const TClassName extends string>(
		options: Readonly<{ className: TClassName }>,
	): DeclaredSchema<
		TSource,
		TClassName,
		Readonly<Record<never, never>>,
		DeclaredSchemaShape<SchemaFactoryShape<'NoteSchema'>>
	>
}
interface NoteFactoryMembers<TSource extends PluginSourceState> {
	readonly NoteSchema: NoteFactory<TSource>
}
interface NoteFactories extends SchemaFactoriesHKT {
	readonly factories: NoteFactoryMembers<
		Extract<this['source'], PluginSourceState>
	>
}
interface NoteStatics extends SchemaStaticsHKT {
	readonly statics: 'NoteSchema' extends keyof this['shape']
		? Readonly<{ describe: () => string }>
		: unknown
}

// ADR-0321: a rule can be required once its shape method is called, and a
// field can accept an extra update input.
type Tag = PluginFieldDefinition<
	'fixture.tag',
	string,
	Readonly<{ required: true }>,
	Readonly<{
		create: 'optional'
		object: 'required'
		update: 'optional'
		nullable: false
		list: false
	}>
> &
	FieldUpdateInputCarrier<Readonly<{ append: string }>>
interface TagFields extends SchemaFieldsHKT {
	readonly fields: 'tagged' extends keyof this['shape']
		? Readonly<{ tag: Tag }>
		: unknown
}
interface TagRules extends SchemaRulesHKT {
	readonly rules: 'tagged' extends keyof this['shape']
		? Readonly<{ tag: Readonly<{ initial: string }> }>
		: Readonly<Record<never, never>>
}

type FixtureSource =
	| PluginSchemaFactoriesSource<NoteFactories>
	| PluginSchemaStaticsSource<NoteStatics>
	| PluginSchemaFieldsSource<TagFields>
	| PluginSchemaRulesSource<TagRules>
	| PluginSchemaShapeSource<{
			readonly tagged: SchemaShapeMethod<
				readonly [],
				Readonly<{ tagged: object }>
			>
	  }>

declare const fixture: ReturnType<
	typeof plugin<
		'fixture.factories',
		undefined,
		string,
		'^0.0.0',
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		readonly [],
		FixtureSource
	>
>

const App = UltimaBase.use(fixture)

test('adds factories only to applications that install them', () => {
	const Note = App.NoteSchema.define({ className: 'TypedNote' }).with({})
	expectTypeOf(Note.describe()).toEqualTypeOf<string>()
	expectTypeOf(Note).toExtend<SchemaDefinition>()
	// @ts-expect-error -- The root factory has no NoteSchema.
	void UltimaBase.NoteSchema
	const Plain = App.Schema.define({
		className: 'PlainNote',
		fields: () => ({}),
	}).with({})
	// @ts-expect-error -- Ordinary declarations get no factory statics.
	void Plain.describe
})

test('passes the called shape methods to rules slots', () => {
	App.Schema.define({ className: 'Tagged', fields: () => ({}) })
		.tagged()
		.with({ tag: { initial: 'a' } })
	App.Schema.define({ className: 'TaggedMissing', fields: () => ({}) })
		.tagged()
		// @ts-expect-error -- `tag` is required once `.tagged()` is called.
		.with({})
	App.Schema.define({ className: 'Untagged', fields: () => ({}) }).with({
		// @ts-expect-error -- `tag` needs `.tagged()`.
		tag: { initial: 'a' },
	})
})

test('accepts a field update input in update data only', async () => {
	const Tagged = App.Schema.define({ className: 'TaggedInput', fields: () => ({}) })
		.tagged()
		.with({ tag: { initial: 'a' } })
	await Tagged.updateOne({ where: { id: 'x' }, data: { tag: { append: 'b' } } })
	await Tagged.updateOne({ where: { id: 'x' }, data: { tag: 'c' } })
	// @ts-expect-error -- Creates take the field value only.
	await Tagged.createOne({ data: { tag: { append: 'b' } } })
})
