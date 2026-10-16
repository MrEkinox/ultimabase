// Feature keys of `define` (ADR-0339): the installed plugins contribute them
// generically through their declared features (Core never names a plugin),
// and `define` captures the whole options object once, so declarations that
// set the same features share one shape record.
import type {
	DeclaredSchemaShape,
	SchemaFeatureRequiredRules,
	SchemaShapeMethodArguments,
} from '../../plugins/schema-extensions.js'
import type { PluginSourceState } from '../../plugins/source-projections.js'
import type { CompleteConfiguredFields } from './configured-schema-namespace.js'
import type { SchemaDeclaredFields } from './definition.js'
import type { SchemaFieldName, SchemaRuleIndexOptions } from './indexes.js'
import type { SchemaIndexWhere } from './index-predicates.js'
import type { DeclaredUniqueIndexFields } from './source-unique-targets.js'

/** Keys of `define` owned by Core (ADR-0339). */
export type CoreDefineKey = 'className' | 'fields' | 'indexes'

/**
 * Keys no plugin may contribute as a feature or a rule: Core's `define` keys,
 * its `relations` rule and the `with` call itself (ADR-0339).
 */
export type ReservedSchemaKey = CoreDefineKey | 'relations' | 'with'

type FeatureName<TFeatures> = Exclude<keyof TFeatures, ReservedSchemaKey> &
	string

/**
 * Value of one feature key: `true` for a feature without options, `true` or
 * its options object otherwise (`softDelete: { mode: 'command' }`).
 */
type DefineFeatureValue<TFeature> = [
	SchemaShapeMethodArguments<TFeature>,
] extends [readonly []]
	? true
	: true | Exclude<SchemaShapeMethodArguments<TFeature>[0], undefined>

// Keyed by a parameter constrained to the feature names, as `Pick` is, so
// hovers and completions keep each feature's documentation.
type DefineFeatureEntries<TFeatures, TNames extends keyof TFeatures> = {
	readonly [TName in TNames]?: DefineFeatureValue<TFeatures[TName]>
}

/**
 * The feature keys the installed plugins contribute to `define`, each typed
 * `true` or with its options object.
 *
 * @example `App.Schema.define({ className: 'Post', fields, softDelete: { mode: 'command' }, acl: true })`
 */
export type DefineFeatures<TSource extends PluginSourceState> =
	DefineFeatureEntries<
		TSource['shapeMethods'],
		FeatureName<TSource['shapeMethods']>
	>

type UnionToIntersection<TValue> = (
	TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
	? TIntersection
	: never

type LastMember<TUnion> =
	UnionToIntersection<
		TUnion extends unknown ? () => TUnion : never
	> extends () => infer TLast
		? TLast
		: never

// Joins the feature names into the message of an unknown key; evaluated only
// for that message.
type JoinNames<TNames extends string, TJoined extends string = ''> = [
	TNames,
] extends [never]
	? TJoined
	: LastMember<TNames> extends infer TLast extends string
		? JoinNames<Exclude<TNames, TLast>, `, ${TLast}${TJoined}`>
		: TJoined

/** The message replacing the value of a key `define` does not know. */
export type UnknownDefineKey<
	TKey,
	TFeatureNames extends string,
	TOwnKeys extends string = never,
> = `${TKey & string} is not a key of define(): use className, fields, indexes${JoinNames<TOwnKeys | TFeatureNames>}`

declare const defineFeaturesNotInferred: unique symbol

/**
 * Default of the captured `define` object. TypeScript leaves it uninferred
 * only when the call fails (a typo): the declaration then behaves as if every
 * feature were set and no rule were required, so one typo gives one
 * diagnostic instead of a cascade of missing rules and commands.
 */
export interface DefineFeaturesNotInferred {
	readonly [defineFeaturesNotInferred]?: true
}

/** One index of `define`, typed against the complete fields. */
type CompleteDefineIndex<TFields extends object> = SchemaRuleIndexOptions<
	SchemaFieldName<TFields>,
	SchemaIndexWhere<TFields>
>

declare const unknownIndexOption: unique symbol

/** Refuses the capture of an index entry naming an unknown option. */
interface KnownIndexOptionsOnly {
	readonly [unknownIndexOption]: true
}

type IndexOptionKey = keyof CompleteDefineIndex<SchemaDeclaredFields>

/**
 * The `indexes` of `define`, captured exactly and typed against the declared
 * and feature fields (`isDeleted`). A complete unique index without `where`
 * is a unique target; a partial one only enforces uniqueness (ADR-0339).
 */
export type CompleteDefineIndexes<TFields extends object, TIndexes> = {
	readonly [TIndex in keyof TIndexes]: [
		Exclude<keyof TIndexes[TIndex], IndexOptionKey>,
	] extends [never]
		? CompleteDefineIndex<TFields>
		: CompleteDefineIndex<TFields> & KnownIndexOptionsOnly
}

// The value checked for one key of the captured object. Core keys other
// than `indexes` are typed by the declared options; a factory's own options
// (`members`) by the factory.
type DefineKeyCheck<
	TSource extends PluginSourceState,
	TFields extends SchemaDeclaredFields,
	TFeatures,
	TKey,
	TOwnKeys extends string,
> = TKey extends 'indexes'
	? CompleteDefineIndexes<
			CompleteDefineFields<TSource, TFields, TFeatures>,
			TFeatures[TKey & keyof TFeatures]
		>
	: TKey extends CoreDefineKey | TOwnKeys | typeof defineFeaturesNotInferred
		? unknown
		: TKey extends FeatureName<TSource['shapeMethods']>
			? DefineFeatures<TSource>[TKey]
			: UnknownDefineKey<TKey, FeatureName<TSource['shapeMethods']>, TOwnKeys>

/**
 * Exactness check of the captured `define` object: Core keys pass, `indexes`
 * is typed against the complete fields, feature keys take their plugin's
 * value, and any other key is replaced by a message naming the valid keys.
 */
export type DefineFeatureCheck<
	TSource extends PluginSourceState,
	TFields extends SchemaDeclaredFields,
	TFeatures,
	TOwnKeys extends string = never,
> = {
	readonly [TKey in keyof TFeatures]: DefineKeyCheck<
		TSource,
		TFields,
		TFeatures,
		TKey,
		TOwnKeys
	>
}

type FeatureArguments<TValue> = TValue extends true
	? readonly []
	: readonly [TValue]

// The feature keys set on one declaration as the shape record the field and
// statics slots read (`{ softDelete: readonly [{ mode: 'command' }] }`). One
// `Record` per key, as the shape-method chain builds it, so declarations
// setting the same features share one shape type and its slot evaluations;
// a mapped type over the captured object would be a new type per schema.
type FeatureShape<
	TFeatures,
	TNames extends keyof TFeatures,
> = UnionToIntersection<
	TNames extends unknown
		? Readonly<Record<TNames, FeatureArguments<TFeatures[TNames]>>>
		: never
>

declare const failedDefineShape: unique symbol

/** Marks the shape record of a declaration whose `define` failed. */
export interface FailedDefineShape {
	readonly [failedDefineShape]: true
}

declare const definedFeatureForm: unique symbol

/**
 * Marks the options of a declaration whose `define` sets feature keys: its
 * `.with` takes only `(plugins) => plugins…` (ADR-0339).
 */
export interface DefinedFeatureForm {
	readonly [definedFeatureForm]: true
}

type EveryFeatureShape<TSource extends PluginSourceState> = {
	readonly [TKey in FeatureName<TSource['shapeMethods']>]: readonly []
} & FailedDefineShape

// `define` failed: TypeScript left the object uninferred, or it names an
// unknown key (a misspelled feature must not remove the feature's fields).
type IsFailedDefine<
	TSource extends PluginSourceState,
	TFeatures,
	TOwnKeys extends string,
> = typeof defineFeaturesNotInferred extends keyof TFeatures
	? true
	: [
				Exclude<
					keyof TFeatures,
					CoreDefineKey | TOwnKeys | FeatureName<TSource['shapeMethods']>
				>,
		  ] extends [never]
		? false
		: true

type SetFeatureName<
	TSource extends PluginSourceState,
	TFeatures,
> = keyof TFeatures & FeatureName<TSource['shapeMethods']>

/**
 * The shape record of one `define` call: the features it sets, beside a
 * factory's own record (`{ UserSchema: readonly [] }`).
 */
export type DefineFeatureShape<
	TSource extends PluginSourceState,
	TFeatures,
	TFactoryShape extends object = Readonly<Record<never, never>>,
	TOwnKeys extends string = never,
> =
	IsFailedDefine<TSource, TFeatures, TOwnKeys> extends true
		? TFactoryShape & EveryFeatureShape<TSource>
		: [SetFeatureName<TSource, TFeatures>] extends [never]
			? TFactoryShape
			: TFactoryShape &
					FeatureShape<TFeatures, SetFeatureName<TSource, TFeatures>>

/**
 * The declaration options carrying the shape record of one `define` call;
 * a call that sets feature keys is marked for the callback-only `.with`.
 */
export type DefineFeatureOptions<
	TSource extends PluginSourceState,
	TFeatures,
	TFactoryShape extends object = Readonly<Record<never, never>>,
	TOwnKeys extends string = never,
> = [SetFeatureName<TSource, TFeatures>] extends [never]
	? DeclaredSchemaShape<
			DefineFeatureShape<TSource, TFeatures, TFactoryShape, TOwnKeys>
		>
	: DeclaredSchemaShape<
			DefineFeatureShape<TSource, TFeatures, TFactoryShape, TOwnKeys>
		> &
			DefinedFeatureForm

/** Feature keys set by one `define` call: their shape methods leave the chain. */
export type DefineFeatureNames<
	TSource extends PluginSourceState,
	TFeatures,
	TOwnKeys extends string = never,
> =
	IsFailedDefine<TSource, TFeatures, TOwnKeys> extends true
		? never
		: SetFeatureName<TSource, TFeatures>

/** Unique targets of the `indexes` of one `define` call (ADR-0332, ADR-0339). */
export type DefineUniqueIndexFields<TFeatures> = TFeatures extends {
	readonly indexes: infer TIndexes
}
	? DeclaredUniqueIndexFields<TIndexes>
	: never

/** The declared and feature fields one `define` call types its indexes against. */
export type CompleteDefineFields<
	TSource extends PluginSourceState,
	TFields extends SchemaDeclaredFields,
	TFeatures,
> = NoInfer<
	CompleteConfiguredFields<
		TSource,
		TFields,
		DeclaredSchemaShape<DefineFeatureShape<TSource, TFeatures>>
	>
>

/**
 * Rules the features of one shape record require (`acl` once `acl: true`):
 * `.with((plugins) => …)` must set them. A failed `define` requires none.
 */
export type RequiredSchemaRuleName<
	TSource extends PluginSourceState,
	TShape,
> = TShape extends FailedDefineShape
	? never
	: {
			[
				TName in keyof TShape & keyof TSource['shapeMethods']
			]: SchemaFeatureRequiredRules<TSource['shapeMethods'][TName]>
		}[keyof TShape & keyof TSource['shapeMethods']]
