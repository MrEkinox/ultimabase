import { expectTypeOf, test } from 'vitest'

import {
	UltimaBase,
	type BooleanField,
	type ForbiddenMutationInputField,
	type ScalarFieldTypegenState,
	type StringField,
} from '../index.js'
import {
	plugin,
	type PluginSchemaMutationDefinition,
	type PluginSchemaFieldsSource,
	type PluginSchemaRulesSource,
	type PluginSchemaShapeSource,
	type PluginSchemaStaticsSource,
	type SchemaCommands,
	type SchemaFieldsHKT,
	type SchemaRulesHKT,
	type SchemaShapeMethod,
	type SchemaStaticsHKT,
} from '../plugin.js'
import type { PluginSource } from './definition.js'

// ADR-0316 decision 1: plugins add fields, statics and rules through
// higher-kinded slots that Core evaluates against the called shape methods.
type Flagged = BooleanField<ScalarFieldTypegenState<true, false, false, true>>
type Note = StringField<ScalarFieldTypegenState<false, false, false, false>>
type Archive = PluginSchemaMutationDefinition<
	'fixture.slots.archive',
	'1.0.0',
	undefined,
	readonly [],
	'request',
	'update',
	'after'
>
type ArchiveAll = PluginSchemaMutationDefinition<
	'fixture.slots.archive-all',
	'1.0.0',
	undefined,
	readonly [],
	'request',
	'update',
	'after',
	Readonly<Record<never, never>>,
	'many'
>

type FlagOptions = Readonly<{ commands?: true; note?: true }>

// Fields read the shape arguments only, never the schema.
interface FlagFields extends SchemaFieldsHKT {
	readonly fields: ('flag' extends keyof this['shape']
		? Readonly<{ flagged: ForbiddenMutationInputField<Flagged> }>
		: unknown) &
		(this['shape'] extends Readonly<{
			flag: readonly [{ readonly note: true }]
		}>
			? Readonly<{ note: Note }>
			: unknown)
}

// Statics read the shape arguments and the configured schema.
interface FlagStatics extends SchemaStaticsHKT {
	readonly statics: this['shape'] extends Readonly<{
		flag: readonly [{ readonly commands: true }]
	}>
		? SchemaCommands<
				this['schema'],
				{ archiveOne: Archive; archiveMany: ArchiveAll }
			>
		: unknown
}

interface FlagRules extends SchemaRulesHKT {
	readonly rules: Readonly<{ flagNote?: string }>
}

type FlagSource =
	| PluginSchemaShapeSource<{
			flag: SchemaShapeMethod<
				readonly [options?: FlagOptions],
				Readonly<{ flag: object }>
			>
	  }>
	| PluginSchemaFieldsSource<FlagFields>
	| PluginSchemaStaticsSource<FlagStatics>
	| PluginSchemaRulesSource<FlagRules>

// ADR-0316 decision 3: the static source is passed, not re-typed by a cast.
const flagPlugin = plugin<
	'fixture.slots',
	undefined,
	'1.0.0',
	'^0.0.0',
	undefined,
	undefined,
	undefined,
	undefined,
	undefined,
	readonly [],
	FlagSource
>({ id: 'fixture.slots', version: '1.0.0', core: '^0.0.0', contributions: [] })

const App = UltimaBase.use(flagPlugin)

test('plugin() keeps an explicit static source', () => {
	expectTypeOf<PluginSource<typeof flagPlugin>>().toEqualTypeOf<FlagSource>()
	const inferred = plugin({
		id: 'fixture.inferred',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [],
	})
	expectTypeOf(inferred).toHaveProperty('manifest')
	expectTypeOf<PluginSource<typeof inferred>>().toBeNever()
})

test('adds fields from the called shape methods and their arguments', () => {
	const Flagged = App.Schema.define({
		className: 'SlotFlagged',
		fields: (field) => ({ title: field.string() }),
	})
		.flag({ note: true })
		.with({})
	const Plain = App.Schema.define({
		className: 'SlotPlain',
		fields: (field) => ({ title: field.string() }),
	}).with({})

	expectTypeOf(
		Flagged.findOne({ select: { flagged: true, note: true } }),
	).resolves.toEqualTypeOf<{
		readonly id: string
		readonly flagged: boolean
		readonly note: string | null
	} | null>()
	// @ts-expect-error -- Server-written fields are rejected in create input.
	void Flagged.createOne({ data: { flagged: true } })
	// @ts-expect-error -- A schema without `.flag()` has no `flagged`.
	void Plain.findOne({ select: { flagged: true } })
})

test('adds statics typed against the configured schema', () => {
	const Commands = App.Schema.define({
		className: 'SlotCommands',
		fields: (field) => ({ title: field.string() }),
	})
		.flag({ commands: true })
		.with({})
	const Fields = App.Schema.define({
		className: 'SlotFieldsOnly',
		fields: (field) => ({ title: field.string() }),
	})
		.flag()
		.with({})

	expectTypeOf(
		Commands.archiveOne({ id: 'row-1', select: { title: true } }),
	).resolves.toEqualTypeOf<{
		readonly id: string
		readonly title: string | null
	}>()
	expectTypeOf(
		Commands.archiveMany({ where: { title: { eq: 'x' } } }),
	).resolves.toExtend<readonly object[]>()
	// @ts-expect-error -- `.flag()` without `commands` adds no command.
	void Fields.archiveOne
})

test('types the rules of `.with` and keeps shape methods single-use', () => {
	App.Schema.define({
		className: 'SlotRules',
		fields: (field) => ({ title: field.string() }),
	})
		.flag()
		.with({ flagNote: 'reviewed' })
	App.Schema.define({
		className: 'SlotBadRules',
		fields: (field) => ({ title: field.string() }),
	}).with({
		// @ts-expect-error -- The rule value is a string.
		flagNote: 1,
	})
	const Once = App.Schema.define({
		className: 'SlotOnce',
		fields: (field) => ({ title: field.string() }),
	}).flag()
	// @ts-expect-error -- A shape method is unavailable once called.
	void Once.flag
})

test('generic shape methods add no initializer cycle on self relations', () => {
	const Node = App.Schema.define({
		className: 'SlotNode',
		fields: (field) => ({
			parent: field.pointer({ target: () => Node }),
			children: field.relation({ target: () => Node, mappedBy: 'parent' }),
		}),
	})
		.flag({ commands: true, note: true })
		.with({})
	expectTypeOf(
		Node.findMany({ include: { parent: { select: { flagged: true } } } }),
	).resolves.toExtend<readonly object[]>()
})
