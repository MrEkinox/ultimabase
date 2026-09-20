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
import { assertCapabilityProviderDeclaration } from './capability-providers.js'
import {
	assertCapabilityRequirement,
	type CapabilityRequirement,
} from './capability-requirements.js'

const normalizeCapabilityArray = <TValue>(
	values: readonly TValue[] | undefined,
	path: string,
	assertValue: (value: unknown, path: string) => void,
): readonly TValue[] => {
	if (values === undefined) return immutableArray([])

	const untrustedValues: unknown = values
	if (!isUnknownArray(untrustedValues)) {
		throw new TypeError(`${path} must be an array`)
	}

	for (const [index, value] of untrustedValues.entries()) {
		assertValue(value, `${path}[${String(index)}]`)
	}

	return immutableArray(values)
}

const assertRequirementOptionality = (
	requirement: CapabilityRequirement,
	optional: boolean,
	path: string,
): void => {
	if (requirement.optional !== optional) {
		throw new TypeError(
			`${path} must be created by ${optional ? 'optionalCapability' : 'requireCapability'}`,
		)
	}
}

/** Snapshots capability arrays without selecting providers or materializing values. */
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
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('capabilities must be a plain object')
	}

	for (const key of Object.keys(untrustedOptions)) {
		if (key !== 'provides' && key !== 'requires' && key !== 'optional') {
			throw new TypeError(`capabilities contains unknown option: ${key}`)
		}
	}

	const provides = normalizeCapabilityArray(
		options.provides,
		'capabilities.provides',
		assertCapabilityProviderDeclaration,
	)
	const requires = normalizeCapabilityArray(
		options.requires,
		'capabilities.requires',
		assertCapabilityRequirement,
	)
	const optional = normalizeCapabilityArray(
		options.optional,
		'capabilities.optional',
		assertCapabilityRequirement,
	)

	for (const [index, requirement] of requires.entries()) {
		assertRequirementOptionality(
			requirement,
			false,
			`capabilities.requires[${String(index)}]`,
		)
	}

	for (const [index, requirement] of optional.entries()) {
		assertRequirementOptionality(
			requirement,
			true,
			`capabilities.optional[${String(index)}]`,
		)
	}

	return immutableRecord({
		provides,
		requires,
		optional,
	})
}
