// The names the schema gives each model's types and root fields (D-107).

export const upper = (name: string): string =>
	name.charAt(0).toUpperCase() + name.slice(1)

export const lower = (name: string): string =>
	name.charAt(0).toLowerCase() + name.slice(1)

/** `post` → `posts`, `category` → `categories`, `box` → `boxes`. */
export function plural(name: string): string {
	if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`
	if (/(?:s|x|z|ch|sh)$/i.test(name)) return `${name}es`
	return `${name}s`
}

/** A model's root fields: its one-row name and its list name. */
export function rootNames(
	model: string,
	given: string | undefined,
): { readonly single: string; readonly list: string } {
	const single = lower(model)
	const list = given ?? plural(single)
	if (list === single) {
		throw new Error(
			`${model}: its list field would be named ${single} too; set .with({ graphql: { plural } }).`,
		)
	}
	return { single, list }
}
