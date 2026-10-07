import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { assertExactObjectKeys } from '../exact-object-validation.js'
import { snapshotJsonValue } from '../schema/fields/builtins/json.js'

import type {
	CapabilityRequirement,
	CapabilityToken,
	PluginCapabilityReader,
} from './capabilities.js'

import {
	applicationSchemaContributionOwner,
	type ApplicationSchemaContributionOwner,
	type SchemaContributionOwner,
	type SchemaContributionOwnerReference,
} from '../schema/schema/provenance.js'

import { type SchemaOptionRuntimeRequirement } from './schema-option-definitions.js'

import { type SchemaSelectorOptions } from './schema-patch-contracts.js'

export const normalizeSelector = (selector: unknown): SchemaSelectorOptions => {
	const untrustedSelector = selector
	if (!isPlainRecord(untrustedSelector)) {
		throw new TypeError('Schema selector must be a plain object')
	}

	assertExactObjectKeys(
		untrustedSelector,
		new Set(['className', 'field', 'option', 'owner']),
		'Unknown schema selector key: ',
	)

	const className = untrustedSelector.className
	if (className !== undefined) {
		assertNonEmptyString(className, 'Schema selector className')
	}

	const fieldInput = untrustedSelector.field
	let field: SchemaSelectorOptions['field']
	if (fieldInput !== undefined) {
		if (!isPlainRecord(fieldInput)) {
			throw new TypeError('Schema selector field must be a plain object')
		}
		assertExactObjectKeys(
			fieldInput,
			new Set(['kind', 'name']),
			'Unknown schema selector field key: ',
		)
		assertNonEmptyString(fieldInput.name, 'Schema selector field.name')
		if (fieldInput.kind !== undefined) {
			assertNonEmptyString(fieldInput.kind, 'Schema selector field.kind')
		}
		field = immutableRecord({
			name: fieldInput.name,
			...(fieldInput.kind === undefined ? {} : { kind: fieldInput.kind }),
		})
	}

	const optionInput = untrustedSelector.option
	let option: SchemaSelectorOptions['option']
	if (optionInput !== undefined) {
		if (!isPlainRecord(optionInput)) {
			throw new TypeError('Schema selector option must be a plain object')
		}
		assertExactObjectKeys(
			optionInput,
			new Set(['equals', 'name', 'path', 'present']),
			'Unknown schema selector option key: ',
		)
		assertNonEmptyString(optionInput.name, 'Schema selector option.name')
		const hasEquals = Object.hasOwn(optionInput, 'equals')
		const hasPath = Object.hasOwn(optionInput, 'path')
		const hasPresent = Object.hasOwn(optionInput, 'present')
		if (hasPresent && optionInput.present !== false) {
			throw new TypeError('Schema selector option.present must be false')
		}
		if (hasPresent && (hasEquals || hasPath)) {
			throw new TypeError(
				'Schema selector option.present cannot be combined with option.equals or option.path',
			)
		}
		if (!hasEquals && hasPath) {
			throw new TypeError('Schema selector option.path requires option.equals')
		}
		if (optionInput.path !== undefined && !isUnknownArray(optionInput.path)) {
			throw new TypeError('Schema selector option.path must be a list')
		}
		const path = optionInput.path
		const normalizedPath =
			path === undefined
				? undefined
				: immutableArray(
						path.map((segment, index) => {
							assertNonEmptyString(
								segment,
								`Schema selector option.path[${String(index)}]`,
							)
							return segment
						}),
					)
		option = hasPresent
			? immutableRecord({ name: optionInput.name, present: false as const })
			: hasEquals
				? immutableRecord({
						equals: snapshotJsonValue(
							optionInput.equals,
							'Schema selector option.equals',
						),
						name: optionInput.name,
						...(normalizedPath === undefined ? {} : { path: normalizedPath }),
					})
				: immutableRecord({ name: optionInput.name })
	}

	const ownerInput = untrustedSelector.owner
	let owner: SchemaContributionOwnerReference | undefined
	if (ownerInput !== undefined) {
		if (!isPlainRecord(ownerInput)) {
			throw new TypeError('Schema selector owner must be a plain object')
		}
		if (ownerInput.kind === 'application') {
			assertExactObjectKeys(
				ownerInput,
				new Set(['kind']),
				'Unknown schema selector owner key: ',
			)
			owner = applicationOwner
		} else if (ownerInput.kind === 'plugin') {
			assertExactObjectKeys(
				ownerInput,
				new Set(['instanceId', 'kind', 'pluginId']),
				'Unknown schema selector owner key: ',
			)
			assertNonEmptyString(
				ownerInput.pluginId,
				'Schema selector owner.pluginId',
			)
			if (ownerInput.instanceId !== undefined) {
				assertNonEmptyString(
					ownerInput.instanceId,
					'Schema selector owner.instanceId',
				)
			}
			owner = immutableRecord({
				kind: 'plugin',
				pluginId: ownerInput.pluginId,
				...(ownerInput.instanceId === undefined
					? {}
					: { instanceId: ownerInput.instanceId }),
			})
		} else {
			throw new TypeError(
				'Schema selector owner.kind must be application or plugin',
			)
		}
	}

	return immutableRecord({
		...(className === undefined ? {} : { className }),
		...(field === undefined ? {} : { field }),
		...(option === undefined ? {} : { option }),
		...(owner === undefined ? {} : { owner }),
	})
}

export const applicationOwner: ApplicationSchemaContributionOwner =
	applicationSchemaContributionOwner

export const readDeclaredRuntimeCapability = (
	reader: PluginCapabilityReader,
	requirement: SchemaOptionRuntimeRequirement,
): unknown =>
	requirement.optional
		? reader.get(
				requirement as CapabilityRequirement<
					CapabilityToken,
					true,
					string,
					'materialization'
				>,
			)
		: reader.get(
				requirement as CapabilityRequirement<
					CapabilityToken,
					false,
					string,
					'materialization'
				>,
			)

export const sameOwner = (
	owner: SchemaContributionOwner,
	reference: SchemaContributionOwnerReference,
): boolean => {
	if (owner.kind !== reference.kind) return false
	if (owner.kind !== 'plugin') return true

	return (
		reference.kind === 'plugin' &&
		owner.pluginId === reference.pluginId &&
		owner.instanceId === reference.instanceId
	)
}
