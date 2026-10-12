// In `define(...)`, a virtual field resolver reads its selected values as
// `unknown`: the schema it belongs to is still being typed (ADR-0297).
export const readText = (value: unknown): string =>
	typeof value === 'string' ? value : ''

/** Reads the selected `presentation` object of an article. */
export const readPresentation = (
	value: unknown,
): Readonly<{ subtitle: string | null; tags: readonly string[] }> => {
	const subtitle: unknown =
		typeof value === 'object' && value !== null
			? Reflect.get(value, 'subtitle')
			: null
	const tags: unknown =
		typeof value === 'object' && value !== null
			? Reflect.get(value, 'tags')
			: null
	return {
		subtitle: typeof subtitle === 'string' ? subtitle : null,
		tags: Array.isArray(tags)
			? tags.filter((tag): tag is string => typeof tag === 'string')
			: [],
	}
}
