import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import { satisfies, validRange } from 'semver'

import { assertCapabilityOptions } from './capability-declaration-validation.js'
import {
	assertCapabilityToken,
	type CapabilityToken,
} from './capability-token.js'

/** Declares one compatible capability use without reading a provider. */
export type CapabilityRequirementPhase = 'materialization' | 'setup'

export interface CapabilityRequirement<
	TToken extends CapabilityToken = CapabilityToken,
	TOptional extends boolean = boolean,
	TRange extends string = string,
	TPhase extends CapabilityRequirementPhase = CapabilityRequirementPhase,
> {
	readonly kind: 'capability-requirement'
	readonly token: TToken
	readonly version: TRange
	readonly optional: TOptional
	/** Selects provider-first materialization or order-independent setup access. */
	readonly phase: TPhase
}

const capabilityRequirements = new WeakSet<object>()
const capabilityRequirementOptionKeys = new Set(['phase'])

/** Selects when an application capability requirement may be consumed. */
export interface CapabilityRequirementOptions<
	TPhase extends CapabilityRequirementPhase = CapabilityRequirementPhase,
> {
	readonly phase: TPhase
}

const normalizeCapabilityRequirementPhase = (
	options: CapabilityRequirementOptions | undefined,
): CapabilityRequirementPhase => {
	if (options === undefined) return 'materialization'

	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('capability requirement options must be a plain object')
	}
	assertCapabilityOptions(
		untrustedOptions,
		capabilityRequirementOptionKeys,
		'capability requirement options',
	)
	if (
		untrustedOptions.phase !== 'materialization' &&
		untrustedOptions.phase !== 'setup'
	) {
		throw new TypeError(
			'capability requirement phase must be materialization or setup',
		)
	}

	return untrustedOptions.phase
}

const createCapabilityRequirement = <
	const TToken extends CapabilityToken,
	const TOptional extends boolean,
	const TRange extends string,
	const TPhase extends CapabilityRequirementPhase,
>(
	token: TToken,
	version: TRange,
	optional: TOptional,
	phase: TPhase,
): CapabilityRequirement<TToken, TOptional, TRange, TPhase> => {
	assertCapabilityToken(token, 'capability requirement token')
	assertNonEmptyString(version, 'capability requirement version')
	if (validRange(version) === null) {
		throw new TypeError(
			'capability requirement version must be a valid semantic version range',
		)
	}

	if (!satisfies(token.version, version)) {
		throw new TypeError(
			`Capability token ${token.capabilityId}@${token.version} does not satisfy its declared range ${version}`,
		)
	}

	const requirement = immutableRecord({
		kind: 'capability-requirement' as const,
		token,
		version,
		optional,
		phase,
	})

	capabilityRequirements.add(requirement)
	return requirement
}

/** Declares a capability that must have a compatible provider. */
export const requireCapability = <
	const TToken extends CapabilityToken,
	const TRange extends string,
	const TPhase extends CapabilityRequirementPhase = 'materialization',
>(
	token: TToken,
	version: TRange,
	options?: CapabilityRequirementOptions<TPhase>,
): CapabilityRequirement<TToken, false, TRange, TPhase> =>
	createCapabilityRequirement(
		token,
		version,
		false,
		normalizeCapabilityRequirementPhase(options) as TPhase,
	)

/** Declares a capability that may be absent but must never be probed implicitly. */
export const optionalCapability = <
	const TToken extends CapabilityToken,
	const TRange extends string,
	const TPhase extends CapabilityRequirementPhase = 'materialization',
>(
	token: TToken,
	version: TRange,
	options?: CapabilityRequirementOptions<TPhase>,
): CapabilityRequirement<TToken, true, TRange, TPhase> =>
	createCapabilityRequirement(
		token,
		version,
		true,
		normalizeCapabilityRequirementPhase(options) as TPhase,
	)

/** Rejects forged requirements at manifest boundaries. */
export const assertCapabilityRequirement: (
	value: unknown,
	path: string,
) => asserts value is CapabilityRequirement = (value, path) => {
	if (!isPlainRecord(value) || !capabilityRequirements.has(value)) {
		throw new TypeError(
			`${path} must be created by requireCapability or optionalCapability`,
		)
	}
}

/** Narrows privilege conditions to trusted optional requirements only. */
export const assertOptionalCapabilityRequirement: (
	value: unknown,
	path: string,
) => asserts value is CapabilityRequirement<CapabilityToken, true> = (
	value,
	path,
) => {
	assertCapabilityRequirement(value, path)
	if (!value.optional) {
		throw new TypeError(`${path} must be an optional capability requirement`)
	}
}
