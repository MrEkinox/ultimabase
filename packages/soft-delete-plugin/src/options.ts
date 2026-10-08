import {
	defineSchemaOption,
	type SchemaDefinition,
	type SchemaOptionDefinition,
} from '@ultimabase/core'
import {
	definePluginOptionsParser,
	type PluginOptionsParser,
} from '@ultimabase/plugin-kit'

import type {
	NormalizedSoftDeletePluginOptions,
	SoftDeleteMode,
	SoftDeletePluginOptions,
	SoftDeleteSchemaOption,
} from './contracts.js'

const snapshotMode = (value: unknown, path: string): SoftDeleteMode => {
	if (
		value === 'disabled' ||
		value === 'explicit' ||
		value === 'replace-delete'
	) {
		return value
	}

	throw new TypeError(
		`${path} must be "disabled", "replace-delete", or "explicit"`,
	)
}

const snapshotSchemaOption = (
	value: unknown,
	path: string,
): SoftDeleteSchemaOption => {
	if (value === false || value === 'explicit' || value === 'replace-delete') {
		return value
	}

	throw new TypeError(`${path} must be false, "replace-delete", or "explicit"`)
}

/** @internal Owns the direct application-schema option used by the package. */
export const softDeleteSchemaOption: SchemaOptionDefinition<SoftDeleteSchemaOption> =
	defineSchemaOption({
		normalize: snapshotSchemaOption,
		protocolVersion: 1,
		typegen: false,
	})

/** @internal Parses the factory boundary before Core observes a plugin. */
export const normalizeSoftDeletePluginOptions: PluginOptionsParser<
	NormalizedSoftDeletePluginOptions,
	SoftDeletePluginOptions
> = definePluginOptionsParser({
	name: 'softDeletePlugin options',
	keys: ['defaultMode', 'instanceId'] as const,
	normalize: ({
		defaultMode,
		instanceId,
	}): NormalizedSoftDeletePluginOptions => {
		if (
			instanceId !== undefined &&
			(typeof instanceId !== 'string' || instanceId.length === 0)
		) {
			throw new TypeError(
				'softDeletePlugin instanceId must be a non-empty string',
			)
		}

		return {
			defaultMode:
				defaultMode === undefined
					? 'disabled'
					: snapshotMode(defaultMode, 'softDeletePlugin defaultMode'),
			...(instanceId === undefined ? {} : { instanceId }),
		}
	},
})

/** @internal Resolves one schema without making the default part of Core. */
export const resolveSoftDeleteMode = (
	schema: SchemaDefinition,
	defaultMode: SoftDeleteMode,
): SoftDeleteMode => {
	if (!Object.hasOwn(schema.definition, 'softDelete')) return defaultMode

	const option: unknown = Reflect.get(schema.definition, 'softDelete')
	const normalized = snapshotSchemaOption(
		option,
		`${schema.className}.softDelete`,
	)
	return normalized === false ? 'disabled' : normalized
}
