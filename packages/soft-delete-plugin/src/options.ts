import type { SchemaDefinition } from '@ultimabase/core'
import { readSchemaRules, type PluginIdentity } from '@ultimabase/core/plugin'
import type { Validator } from '@ultimabase/plugin-kit'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/**
 * Options of the `softDelete` feature (`softDelete: { mode: 'command' }`). Without `mode`, `deleteOne` and `deleteMany`
 * become logical; with `mode: 'command'` they keep deleting rows and only the
 * `softDeleteOne`/`softDeleteMany` commands hide them.
 */
export interface SoftDeleteOptions {
	/** Keeps native deletes physical; soft deletion goes through the commands. */
	readonly mode?: 'command'
}

/** How one schema soft-deletes: native deletes rewritten, or commands only. */
export type SoftDeleteSchemaMode = 'command' | 'delete'

/** @internal Validates the options object of the `softDelete` feature. */
export const parseSoftDeleteOptions: Validator<SoftDeleteOptions> = (
	value,
	path,
) => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be an options object`)
	}
	const unknownKey = Object.keys(value).find((key) => key !== 'mode')
	if (unknownKey !== undefined) {
		throw new TypeError(`${path} contains unknown option: ${unknownKey}`)
	}
	if (value.mode !== undefined && value.mode !== 'command') {
		throw new TypeError(`${path}.mode must be "command"`)
	}
	return immutableRecord(value.mode === undefined ? {} : { mode: 'command' })
}

/**
 * @internal Reads how one compiled schema soft-deletes for this exact plugin
 * instance, or `undefined` when its declaration does not set `softDelete`.
 */
export const readSoftDeleteMode = (
	schema: SchemaDefinition,
	owner: PluginIdentity,
): SoftDeleteSchemaMode | undefined => {
	const options = readSchemaRules(schema, owner).softDelete
	if (options === undefined) return undefined
	return isPlainRecord(options) && options.mode === 'command'
		? 'command'
		: 'delete'
}
