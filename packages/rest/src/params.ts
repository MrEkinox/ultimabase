// Query parameters (D-129): each the JSON of the GraphQL argument of its
// name, a string argument as is.
import { badInput } from '@ultimabase/http/internal'
import type { Args } from './entries.ts'

/** What a route reads from its query string. */
export type Accepted = {
	/** Parameters written as JSON. */
	readonly json: readonly string[]
	/** Parameters written as is. */
	readonly text: readonly string[]
}

function parsed(name: string, value: string): unknown {
	try {
		return JSON.parse(value)
	} catch (error) {
		throw badInput(`The query parameter ${name} is not JSON.`, error)
	}
}

/** The parameters of a request, each once and each one the route takes. */
export function paramsOf(url: string, accepted: Accepted): Args {
	const params: { [name: string]: unknown } = {}
	const taken = [...accepted.json, ...accepted.text]
	for (const [name, value] of new URL(url).searchParams) {
		if (Object.hasOwn(params, name)) {
			throw badInput(`The query parameter ${name} is given twice.`)
		}
		if (!taken.includes(name)) {
			const takes = taken.length === 0 ? 'none' : taken.join(', ')
			throw badInput(
				`Unknown query parameter '${name}'; this route takes ${takes}.`,
			)
		}
		params[name] = accepted.text.includes(name) ? value : parsed(name, value)
	}
	return params
}
