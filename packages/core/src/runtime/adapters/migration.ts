import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import { satisfies, valid, validRange } from 'semver'

import { FrameworkError } from '../../errors/framework-error.js'
import type {
	JsonObject,
	JsonValue,
} from '../../schema/fields/builtins/json.js'
import { snapshotJsonValue } from '../../schema/fields/builtins/json.js'
import type { AdapterContributionSnapshot } from './contributions.js'
import { equalJsonValues } from './json-equality.js'

/** Selects the exact persisted contribution upgraded by one bridge intent. */
export interface AdapterUpgradeTarget extends JsonObject {
	readonly contributionId: string
	readonly instanceId?: string
	readonly pluginId: string
}

/** Carries logical migration intent without embedding database-specific work. */
export interface AdapterUpgradeIntentPayload extends JsonObject {
	readonly from: string
	readonly intent: JsonValue
	readonly kind: 'upgrade'
	readonly target: AdapterUpgradeTarget
	readonly to: string
}

/** Creates one immutable upgrade intent for an adapter-specific bridge provider. */
export const adapterUpgradeIntent = (
	options: AdapterUpgradeIntentPayload,
): AdapterUpgradeIntentPayload => {
	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('adapter upgrade intent must be a plain object')
	}
	if (untrustedOptions.kind !== 'upgrade') {
		throw new TypeError('adapter upgrade intent kind must be upgrade')
	}
	if (
		typeof untrustedOptions.from !== 'string' ||
		validRange(untrustedOptions.from) === null
	) {
		throw new TypeError('adapter upgrade intent from must be a SemVer range')
	}
	if (
		typeof untrustedOptions.to !== 'string' ||
		valid(untrustedOptions.to) !== untrustedOptions.to
	) {
		throw new TypeError('adapter upgrade intent to must be canonical SemVer')
	}
	if (!isPlainRecord(untrustedOptions.target)) {
		throw new TypeError('adapter upgrade intent target must be a plain object')
	}
	const pluginId = untrustedOptions.target.pluginId
	const contributionId = untrustedOptions.target.contributionId
	assertNonEmptyString(pluginId, 'adapter upgrade intent target.pluginId')
	assertNonEmptyString(
		contributionId,
		'adapter upgrade intent target.contributionId',
	)
	const instanceId = untrustedOptions.target.instanceId
	if (
		instanceId !== undefined &&
		(typeof instanceId !== 'string' || instanceId.length === 0)
	) {
		throw new TypeError(
			'adapter upgrade intent target.instanceId must be non-empty',
		)
	}
	return immutableRecord({
		from: untrustedOptions.from,
		intent: snapshotJsonValue(
			untrustedOptions.intent,
			'adapter upgrade intent intent',
		),
		kind: 'upgrade' as const,
		target: immutableRecord({
			contributionId,
			...(instanceId === undefined ? {} : { instanceId }),
			pluginId,
		}),
		to: untrustedOptions.to,
	})
}

/** Associates one previous physical contribution with its explicit upgrade. */
export interface PlannedAdapterUpgrade {
	readonly current: AdapterContributionSnapshot
	readonly intent: AdapterContributionSnapshot<AdapterUpgradeIntentPayload>
	readonly previous: AdapterContributionSnapshot
}

/** Retains removed metadata for review without manufacturing destructive work. */
export interface OrphanedAdapterContribution {
	readonly previous: AdapterContributionSnapshot
	readonly reason: 'plugin-or-contribution-removed'
}

/** Separates additions, upgrades, stable state, and orphaned prior metadata. */
export interface AdapterMigrationPlan {
	readonly added: readonly AdapterContributionSnapshot[]
	readonly orphaned: readonly OrphanedAdapterContribution[]
	readonly unchanged: readonly AdapterContributionSnapshot[]
	readonly upgrades: readonly PlannedAdapterUpgrade[]
}

const contributionKey = (snapshot: AdapterContributionSnapshot): string =>
	JSON.stringify([
		snapshot.adapterId,
		snapshot.pluginId,
		snapshot.instanceId ?? null,
		snapshot.contributionId,
	])

const hasSamePhysicalDefinition = (
	previous: AdapterContributionSnapshot,
	current: AdapterContributionSnapshot,
): boolean =>
	previous.packageVersion === current.packageVersion &&
	previous.protocolVersion === current.protocolVersion &&
	equalJsonValues(
		previous.normalizedStaticOptions,
		current.normalizedStaticOptions,
	) &&
	equalJsonValues(previous.payload, current.payload)

const isUpgradeIntent = (
	snapshot: AdapterContributionSnapshot,
): snapshot is AdapterContributionSnapshot<AdapterUpgradeIntentPayload> => {
	const payload: unknown = snapshot.payload
	return (
		snapshot.family === 'migration' &&
		isPlainRecord(payload) &&
		payload.kind === 'upgrade' &&
		typeof payload.from === 'string' &&
		typeof payload.to === 'string' &&
		isPlainRecord(payload.target) &&
		typeof payload.target.pluginId === 'string' &&
		typeof payload.target.contributionId === 'string' &&
		(payload.target.instanceId === undefined ||
			typeof payload.target.instanceId === 'string')
	)
}

const matchesIntent = (
	intent: AdapterContributionSnapshot<AdapterUpgradeIntentPayload>,
	previous: AdapterContributionSnapshot,
	current: AdapterContributionSnapshot,
): boolean =>
	intent.adapterId === current.adapterId &&
	intent.payload.target.pluginId === current.pluginId &&
	intent.payload.target.instanceId === current.instanceId &&
	intent.payload.target.contributionId === current.contributionId &&
	satisfies(previous.packageVersion, intent.payload.from) &&
	intent.payload.to === current.packageVersion

const throwMissingUpgrade = (
	previous: AdapterContributionSnapshot,
	current: AdapterContributionSnapshot,
): never => {
	throw new FrameworkError(
		'PLUGIN_ADAPTER_CAPABILITY_MISSING',
		`Adapter contribution "${current.contributionId}" requires an explicit upgrade from ${previous.packageVersion} to ${current.packageVersion}.`,
		{
			internalDetails: {
				adapterId: current.adapterId,
				contributionId: current.contributionId,
				from: previous.packageVersion,
				pluginId: current.pluginId,
				to: current.packageVersion,
			},
		},
	)
}

/** Plans metadata transitions without inferring rename, drop, or physical SQL. */
export const planAdapterMigrations = (
	previous: readonly AdapterContributionSnapshot[],
	current: readonly AdapterContributionSnapshot[],
	intents: readonly AdapterContributionSnapshot[],
): AdapterMigrationPlan => {
	const previousPhysical = previous.filter(
		(snapshot) => snapshot.family === 'physical-schema',
	)
	const currentPhysical = current.filter(
		(snapshot) => snapshot.family === 'physical-schema',
	)
	const upgradeIntents = intents.filter(isUpgradeIntent)
	const previousByKey = new Map(
		previousPhysical.map((snapshot) => [contributionKey(snapshot), snapshot]),
	)
	const currentByKey = new Map(
		currentPhysical.map((snapshot) => [contributionKey(snapshot), snapshot]),
	)
	const added: AdapterContributionSnapshot[] = []
	const unchanged: AdapterContributionSnapshot[] = []
	const upgrades: PlannedAdapterUpgrade[] = []

	for (const candidate of currentPhysical) {
		const prior = previousByKey.get(contributionKey(candidate))
		if (prior === undefined) {
			added.push(candidate)
			continue
		}
		if (hasSamePhysicalDefinition(prior, candidate)) {
			unchanged.push(candidate)
			continue
		}
		const matching = upgradeIntents.filter((intent) =>
			matchesIntent(intent, prior, candidate),
		)
		if (matching.length === 0) throwMissingUpgrade(prior, candidate)
		if (matching.length > 1) {
			throw new FrameworkError(
				'PLUGIN_CAPABILITY_CONFLICT',
				`Adapter contribution "${candidate.contributionId}" has multiple matching upgrade intents.`,
				{
					internalDetails: {
						adapterId: candidate.adapterId,
						contributionId: candidate.contributionId,
						pluginId: candidate.pluginId,
					},
				},
			)
		}
		const intent = matching[0] ?? throwMissingUpgrade(prior, candidate)
		const upgrade: PlannedAdapterUpgrade = {
			current: candidate,
			intent,
			previous: prior,
		}
		upgrades.push(immutableRecord(upgrade))
	}

	const orphaned = previousPhysical.flatMap((prior) =>
		currentByKey.has(contributionKey(prior))
			? []
			: [
					immutableRecord({
						previous: prior,
						reason: 'plugin-or-contribution-removed' as const,
					}),
				],
	)

	return immutableRecord({
		added: immutableArray(added),
		orphaned: immutableArray(orphaned),
		unchanged: immutableArray(unchanged),
		upgrades: immutableArray(upgrades),
	})
}
