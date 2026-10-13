/**
 * @internal Asks one execution to omit GraphQL's "Did you mean" suggestions,
 * which name fields. The Yoga plugin sets it to `true` while its introspection
 * is off (ADR-0333 amendment); it spells the same versioned global symbol, so
 * neither a public export nor a declared option carries the channel.
 */
export const graphqlHideSuggestionsKey: symbol = Symbol.for(
	'@ultimabase/graphql-plugin/hide-suggestions/v1',
)

/** @internal Reads the channel from checked execute options. */
export const readGraphqlHideSuggestions = (options: object): boolean => {
	const value: unknown = Reflect.get(options, graphqlHideSuggestionsKey)
	if (value !== undefined && typeof value !== 'boolean') {
		throw new TypeError('GraphQL execute suggestion option must be a boolean')
	}
	return value === true
}
