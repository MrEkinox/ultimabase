import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	PluginCapabilityDeclarationOptions,
	PluginCapabilityDeclarations,
} from './capability-declarations.js'
import {
	assertCapabilityProviderDeclaration,
	type CapabilityProviderDeclaration,
} from './capability-providers.js'
import {
	assertCapabilityRequirement,
	assertOptionalCapabilityRequirement,
	type CapabilityRequirement,
} from './capability-requirements.js'
import type { CapabilityToken } from './capability-token.js'

const assertRequiredCapabilityRequirement: (
	value: CapabilityRequirement,
) => asserts value is CapabilityRequirement<CapabilityToken, false> = (
	value,
) => {
	if (value.optional) {
		throw new TypeError('required capability declaration cannot be optional')
	}
}

/** Snapshots one flat capability list into the stable inspection buckets. */
export const normalizeCapabilityDeclarations = (
	options: PluginCapabilityDeclarationOptions | undefined,
): PluginCapabilityDeclarations => {
	if (options === undefined) {
		return immutableRecord({
			provides: immutableArray([]),
			requires: immutableArray([]),
			optional: immutableArray([]),
		})
	}

	const untrustedOptions: unknown = options
	if (!isUnknownArray(untrustedOptions)) {
		throw new TypeError('capabilities must be an array')
	}

	const provides: CapabilityProviderDeclaration[] = []
	const requires: CapabilityRequirement<CapabilityToken, false>[] = []
	const optional: CapabilityRequirement<CapabilityToken, true>[] = []
	for (const [index, declaration] of untrustedOptions.entries()) {
		const path = `capabilities[${String(index)}]`
		if (!isPlainRecord(declaration)) {
			throw new TypeError(
				`${path} must be created by provideCapability, requireCapability, or optionalCapability`,
			)
		}

		if (declaration.kind === 'capability-provider') {
			assertCapabilityProviderDeclaration(declaration, path)
			provides.push(declaration)
			continue
		}
		if (declaration.kind === 'capability-requirement') {
			assertCapabilityRequirement(declaration, path)
			if (declaration.optional) {
				assertOptionalCapabilityRequirement(declaration, path)
				optional.push(declaration)
			} else {
				assertRequiredCapabilityRequirement(declaration)
				requires.push(declaration)
			}
			continue
		}

		throw new TypeError(
			`${path} must be created by provideCapability, requireCapability, or optionalCapability`,
		)
	}

	return immutableRecord({
		provides: immutableArray(provides),
		requires: immutableArray(requires),
		optional: immutableArray(optional),
	})
}
