// A list's kernel read (D-55, D-107): its `where`, its order and its page,
// read with the arguments REST reads (D-139).
import type { Page } from '@ultimabase/http/internal'
import { pageOf } from '@ultimabase/http/internal'
import { plainWhere } from './json-fields.ts'
import type { Args, Registry } from './registry.ts'
import type { Entry } from './registry.ts'

/** The kernel's `where` of a list or count's arguments. */
export function whereOf(registry: Registry, model: string, args: Args): Args {
	const { where } = args
	return typeof where === 'object' && where !== null
		? { where: plainWhere(registry, model, { ...where }) }
		: {}
}

/** A list's kernel read, and its Relay page unless `pagination: 'list'`. */
export function listRead(
	registry: Registry,
	entry: Entry,
	args: Args,
	master: boolean,
): { readonly read: Args; readonly page: Page['relay'] } {
	const { orderBy } = args
	const { read, relay } = pageOf(
		registry.settings.pagination,
		entry,
		args,
		master,
	)
	return {
		read: {
			...whereOf(registry, entry.model.name, args),
			...(orderBy === undefined || orderBy === null ? {} : { orderBy }),
			...read,
		},
		page: relay,
	}
}
