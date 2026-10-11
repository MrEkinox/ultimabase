import path from 'node:path'

import { UltimaBase, type SchemaDefinition } from '@ultimabase/core'
import type { PluginDefinition } from '@ultimabase/core/plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { createJiti } from 'jiti'

import { SchemaTypegenError } from './errors.js'

type TypegenApplication = UltimaBase<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

const readProperty = (value: object, property: PropertyKey): unknown =>
	Reflect.get(value, property)

const isTypegenApplication = (
	candidate: unknown,
): candidate is TypegenApplication => {
	if (candidate instanceof UltimaBase) {
		return true
	}

	if (typeof candidate !== 'object' || candidate === null) {
		return false
	}

	// Transpilation may load a second Core module identity, so constructor identity
	// alone cannot validate a legitimate application exported by the source module.
	return (
		typeof readProperty(candidate, 'compile') === 'function' &&
		typeof readProperty(candidate, 'initialize') === 'function' &&
		typeof readProperty(candidate, 'start') === 'function' &&
		typeof readProperty(candidate, 'dispose') === 'function'
	)
}

export interface LoadTypegenApplicationOptions {
	/** Names the exported UltimaBase instance. */
	readonly exportName: string
	/** Points to one TypeScript or JavaScript application module. */
	readonly sourcePath: string
}

/**
 * Loads one application module through transpilation without requiring its old
 * generated declaration to typecheck first.
 */
export const loadTypegenApplication = async (
	options: LoadTypegenApplicationOptions,
): Promise<TypegenApplication> => {
	// JavaScript callers can omit either option despite the declared type.
	const untrustedSourcePath: unknown = options.sourcePath
	const untrustedExportName: unknown = options.exportName

	if (
		typeof untrustedSourcePath !== 'string' ||
		untrustedSourcePath.trim() === ''
	) {
		throw new TypeError('sourcePath must be a non-empty string')
	}

	if (
		typeof untrustedExportName !== 'string' ||
		untrustedExportName.trim() === ''
	) {
		throw new TypeError('exportName must be a non-empty string')
	}

	const sourcePath = path.resolve(options.sourcePath)
	const jiti = createJiti(import.meta.url, {
		fsCache: false,
		interopDefault: false,
		moduleCache: false,
	})
	const loaded: unknown = await jiti.import(sourcePath)
	const candidate = isPlainRecord(loaded)
		? readProperty(loaded, options.exportName)
		: options.exportName === 'default'
			? loaded
			: undefined

	if (isTypegenApplication(candidate)) {
		return candidate
	}

	throw new SchemaTypegenError(
		'invalid-application-export',
		`Export "${options.exportName}" from "${sourcePath}" must be an UltimaBase instance`,
		{ owner: options.exportName, path: sourcePath },
	)
}
