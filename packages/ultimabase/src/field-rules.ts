// The rules a field's `.with` takes (D-44), and the plugins' own (D-57).
import type { RecordFor } from './record.ts'
import type { Caller } from './rules.ts'
import type { declaredRecord } from './symbols.ts'

// `R` is the record type the developer declares for the rules (D-44). It
// never derives from the model, which is still being typed here: that would
// be a cycle (TS7022).
type ReadFacts<R extends object> = {
	readonly caller: Caller
	readonly operation: 'read'
	readonly record: RecordFor<R>
}
type CreateFacts<V> = {
	readonly caller: Caller
	readonly operation: 'create'
	readonly value: V
}
type UpdateFacts<R extends object, V> = {
	readonly caller: Caller
	readonly operation: 'update'
	readonly record: RecordFor<R>
	readonly value: V
}
type Rule<F> = (facts: F) => boolean
// Named, so a type error shows the rule the developer wrote.
type FieldReadRule<R extends object> = Rule<ReadFacts<R>>
type FieldCreateRule<V> = Rule<CreateFacts<V>>
type FieldUpdateRule<R extends object, V> = Rule<UpdateFacts<R, V>>
type FieldWriteRule<R extends object, V> = Rule<
	CreateFacts<V> | UpdateFacts<R, V>
>
type FieldRule<R extends object, V> = Rule<
	ReadFacts<R> | CreateFacts<V> | UpdateFacts<R, V>
>

/** A field keeps its declared record type, which `defineModel` checks. */
// Each declared field is kept as `(value: T) => T`, which only the same `T`
// fits: a wider or a narrower type fails, and the error shows the model's.
export type Declared<R> = [R] extends [never]
	? unknown
	: {
			readonly [declaredRecord]: {
				readonly [P in keyof R]: (value: R[P]) => R[P]
			}
		}

/** One rule, or one rule per operation (D-44). */
export type FieldAccess<R extends object, V> =
	| FieldRule<R, V>
	| {
			readonly read?: FieldReadRule<R>
			readonly create?: FieldCreateRule<V>
			readonly update?: FieldUpdateRule<R, V>
			readonly write?: FieldWriteRule<R, V>
	  }

/**
 * The rules of the model's plugins for one field, each under the plugin's
 * name and typed by the field's value (D-12, D-57).
 */
type PluginFieldRules<T, V> = {
	readonly [
		X in T as X extends {
			readonly name: infer N extends string
			readonly fieldWith: object
		}
			? N
			: never
	]?: X extends { readonly fieldWith: object }
		? (X & { readonly value: V })['fieldWith']
		: never
}

export type FieldWith<R extends object, V, T = never> = {
	readonly access?: FieldAccess<R, V>
} & PluginFieldRules<T, V>
