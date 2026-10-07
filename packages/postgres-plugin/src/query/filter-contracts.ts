import type {
	QueryFilterExpression,
	QueryRegexFlag,
	QueryRelationFilterNode,
} from '@ultimabase/core'

interface RuntimeFilterTarget {
	readonly field: string
	readonly path?: readonly string[]
}

export type RuntimeEqualityFilter = RuntimeFilterTarget &
	Readonly<{ kind: 'equal' | 'not-equal'; value: unknown }>

type RuntimeComparisonFilter = RuntimeFilterTarget &
	Readonly<{
		kind:
			| 'greater-than'
			| 'greater-than-or-equal'
			| 'less-than'
			| 'less-than-or-equal'
		value: unknown
	}>

export type RuntimeRangeFilter = RuntimeFilterTarget &
	Readonly<{
		kind: 'between' | 'not-between'
		lower: unknown
		upper: unknown
	}>

export type RuntimeMembershipFilter = RuntimeFilterTarget &
	Readonly<{ kind: 'in' | 'not-in'; values: readonly unknown[] }>

export type RuntimeListFilter = RuntimeFilterTarget &
	Readonly<
		| { kind: 'list-empty' }
		| { kind: 'list-has'; value: unknown }
		| {
				kind: 'list-has-every' | 'list-has-some'
				values: readonly unknown[]
		  }
	>

export type RuntimeStringOrContainmentFilter = RuntimeFilterTarget &
	Readonly<{
		kind: 'contained-by' | 'contains' | 'ends-with' | 'starts-with'
		value: unknown
	}>

export type RuntimeKeyFilter = RuntimeFilterTarget &
	Readonly<{ kind: 'has-key'; value: string }>

export type RuntimeKeysFilter = RuntimeFilterTarget &
	Readonly<{
		kind: 'has-all-keys' | 'has-any-keys'
		keys: readonly string[]
	}>

export type RuntimeJsonPathFilter = RuntimeFilterTarget &
	Readonly<{
		kind: 'json-path-exists' | 'json-path-matches'
		source: string
		variables?: Readonly<Record<string, unknown>>
	}>

export type RuntimeRegexFilter = RuntimeFilterTarget &
	Readonly<{
		kind: 'regex'
		pattern: Readonly<{
			flags: readonly QueryRegexFlag[]
			source: string
		}>
	}>

type RuntimeNullFilter = RuntimeFilterTarget &
	Readonly<{ kind: 'null'; isNull: boolean }>

export type RuntimePrimitiveFilter =
	| RuntimeComparisonFilter
	| RuntimeEqualityFilter
	| RuntimeJsonPathFilter
	| RuntimeKeyFilter
	| RuntimeKeysFilter
	| RuntimeListFilter
	| RuntimeMembershipFilter
	| RuntimeNullFilter
	| RuntimeRangeFilter
	| RuntimeRegexFilter
	| RuntimeStringOrContainmentFilter

export type RuntimeFilter = QueryFilterExpression<
	RuntimePrimitiveFilter | QueryRelationFilterNode
>
