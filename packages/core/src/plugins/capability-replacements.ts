import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { snapshotJsonValue } from '../schema/fields/builtins/json.js'
import {
	assertCapabilityContributionId,
	assertCapabilityOptions,
} from './capability-declaration-validation.js'
import {
	retainApplicationCapabilityFactory,
	type ApplicationCapabilityFactory,
	type CapabilityContributionBase,
	type CapabilityContributionTarget,
} from './capability-providers.js'
import {
	assertCapabilityToken,
	type CapabilityConsumerValue,
	type CapabilityProviderValue,
	type CapabilityToken,
} from './capability-token.js'

type DecoratableCapabilityToken = CapabilityToken<
	unknown,
	unknown,
	string,
	string,
	'single' | 'pipeline'
>

/** Declares one owner-bound wrapper around the complete consumer view. */
export interface CapabilityDecoratorDeclaration<
	TToken extends DecoratableCapabilityToken = DecoratableCapabilityToken,
> extends CapabilityContributionBase<TToken> {
	readonly kind: 'capability-decorator'
}

const capabilityDecorators = new WeakSet<object>()
const capabilityDecoratorFunctions = new WeakMap<
	object,
	(consumer: unknown) => unknown
>()

/** Declares a deterministic complete-view decorator for single or pipeline tokens. */
export const decorateCapability = <
	const TToken extends DecoratableCapabilityToken,
>(
	token: TToken,
	options: Readonly<{
		contributionId: string
		decorate: (
			consumer: CapabilityConsumerValue<TToken>,
		) => CapabilityConsumerValue<TToken>
	}>,
): CapabilityDecoratorDeclaration<TToken> => {
	assertCapabilityToken(token, 'capability decorator token')
	if ((token as CapabilityToken).cardinality === 'multiple') {
		throw new TypeError('multiple capabilities cannot be decorated')
	}

	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('capability decorator options must be a plain object')
	}
	assertCapabilityOptions(
		untrustedOptions,
		new Set(['contributionId', 'decorate']),
		'capability decorator options',
	)
	assertCapabilityContributionId(options.contributionId, 'contributionId')
	if (typeof options.decorate !== 'function') {
		throw new TypeError('capability decorator decorate must be a function')
	}

	const decorator = immutableRecord({
		kind: 'capability-decorator' as const,
		token,
		contributionId: options.contributionId,
	})
	capabilityDecorators.add(decorator)
	capabilityDecoratorFunctions.set(decorator, options.decorate)
	return decorator
}

/** Declares one privileged replacement with its own provider provenance. */
export type CapabilityReplacementDeclaration<
	TToken extends CapabilityToken = CapabilityToken,
> = CapabilityContributionBase<TToken> &
	Readonly<{
		kind: 'capability-replacement'
		target: CapabilityContributionTarget
	}> &
	(TToken['lifetime'] extends 'declaration'
		? Readonly<{ value: CapabilityProviderValue<TToken> }>
		: Readonly<Record<never, never>>)

const capabilityReplacements = new WeakSet<object>()

type ReplaceCapabilityOptions<TToken extends CapabilityToken> = Readonly<{
	contributionId: string
	target: CapabilityContributionTarget
}> &
	(TToken['lifetime'] extends 'declaration'
		? Readonly<{ value: CapabilityProviderValue<TToken> }>
		: Readonly<{
				create: ApplicationCapabilityFactory<CapabilityProviderValue<TToken>>
			}>)

const snapshotContributionTarget = (
	target: unknown,
): CapabilityContributionTarget => {
	if (!isPlainRecord(target)) {
		throw new TypeError('capability replacement target must be a plain object')
	}
	assertCapabilityOptions(
		target,
		new Set(['contributionId', 'owner']),
		'capability replacement target',
	)
	assertCapabilityContributionId(target.contributionId, 'target.contributionId')
	if (!isPlainRecord(target.owner)) {
		throw new TypeError(
			'capability replacement target.owner must be a plain object',
		)
	}
	assertCapabilityOptions(
		target.owner,
		new Set(['instanceId', 'pluginId']),
		'capability replacement target.owner',
	)
	assertNonEmptyString(target.owner.pluginId, 'target.owner.pluginId')
	if (target.owner.instanceId !== undefined) {
		assertNonEmptyString(target.owner.instanceId, 'target.owner.instanceId')
	}

	return immutableRecord({
		owner: immutableRecord({
			pluginId: target.owner.pluginId,
			...(target.owner.instanceId === undefined
				? {}
				: { instanceId: target.owner.instanceId }),
		}),
		contributionId: target.contributionId,
	})
}

/** Declares an exact owner-targeted provider replacement. */
export const replaceCapability = <const TToken extends CapabilityToken>(
	token: TToken,
	options: ReplaceCapabilityOptions<TToken>,
): CapabilityReplacementDeclaration<TToken> => {
	assertCapabilityToken(token, 'capability replacement token')
	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('capability replacement options must be a plain object')
	}
	assertCapabilityContributionId(options.contributionId, 'contributionId')
	const target = snapshotContributionTarget(options.target)

	if (token.lifetime === 'declaration') {
		assertCapabilityOptions(
			untrustedOptions,
			new Set(['contributionId', 'target', 'value']),
			'capability replacement options',
		)
	} else {
		assertCapabilityOptions(
			untrustedOptions,
			new Set(['contributionId', 'create', 'target']),
			'capability replacement options',
		)
		if (typeof untrustedOptions.create !== 'function') {
			throw new TypeError(
				'application capability replacement create must be a function',
			)
		}
	}

	const replacement = immutableRecord({
		kind: 'capability-replacement' as const,
		token,
		contributionId: options.contributionId,
		target,
		...(token.lifetime === 'declaration'
			? {
					value: snapshotJsonValue(
						untrustedOptions.value,
						'capability replacement value',
					),
				}
			: {}),
	})

	capabilityReplacements.add(replacement)
	if (token.lifetime === 'application') {
		retainApplicationCapabilityFactory(
			replacement,
			untrustedOptions.create as ApplicationCapabilityFactory<unknown>,
		)
	}
	return replacement as CapabilityReplacementDeclaration<TToken>
}

/** Applies one hidden decorator to an already composed consumer view. */
export const runCapabilityDecorator = <
	TToken extends DecoratableCapabilityToken,
>(
	declaration: CapabilityDecoratorDeclaration<TToken>,
	consumer: CapabilityConsumerValue<TToken>,
): CapabilityConsumerValue<TToken> => {
	const decorate = capabilityDecoratorFunctions.get(declaration)
	if (decorate === undefined) {
		throw new TypeError('Unknown capability decorator')
	}

	return decorate(consumer)
}

/** Rejects forged decorator declarations at manifest boundaries. */
export const assertCapabilityDecoratorDeclaration: (
	value: unknown,
	path: string,
) => asserts value is CapabilityDecoratorDeclaration = (value, path) => {
	if (!isPlainRecord(value) || !capabilityDecorators.has(value)) {
		throw new TypeError(`${path} must be created by decorateCapability`)
	}
}

/** Rejects forged replacement declarations at manifest boundaries. */
export const assertCapabilityReplacementDeclaration: (
	value: unknown,
	path: string,
) => asserts value is CapabilityReplacementDeclaration = (value, path) => {
	if (!isPlainRecord(value) || !capabilityReplacements.has(value)) {
		throw new TypeError(`${path} must be created by replaceCapability`)
	}
}
