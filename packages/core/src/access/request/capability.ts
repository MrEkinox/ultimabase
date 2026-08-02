import { assertNonEmptyString } from '@ultimabase/shared'

/**
 * Defines one identity-based request capability that transport data cannot
 * reproduce from a matching string alone.
 */
export class RequestCapability<const TName extends string = string> {
	// The type-only private member prevents structurally forged capability objects.
	declare private readonly capabilityIdentity: never

	readonly name: TName

	constructor(name: TName) {
		assertNonEmptyString(name, 'Request capability name')
		this.name = name

		// Capability tokens remain stable when shared by plugins and contexts.
		Object.freeze(this)
	}
}
