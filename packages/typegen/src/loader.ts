import path from 'node:path'

import {
	FrameworkApplication,
	UltimaBase,
	type PluginDefinition,
	type SchemaDefinition,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import { createJiti } from 'jiti'

import { SchemaTypegenError } from './errors.js'

type TypegenApplication = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

const readProperty = (value: object, property: PropertyKey): unknown =>
	(value as Readonly<Record<PropertyKey, unknown>>)[property]

const isTypegenApplication = (
	candidate: unknown,
): candidate is TypegenApplication => {
	if (candidate instanceof FrameworkApplication) {
		return true
	}

	if (typeof candidate !== 'object' || candidate === null) {
		return false
	}

	const schemas = readProperty(candidate, 'schemas')

	// Transpilation may load a second Core module identity, so constructor identity
	// alone cannot validate a legitimate application exported by the source module.
	return (
		typeof readProperty(candidate, 'compileSchemas') === 'function' &&
		typeof schemas === 'object' &&
		schemas !== null &&
		typeof readProperty(schemas, 'get') === 'function' &&
		typeof readProperty(schemas, 'values') === 'function'
	)
}

export interface LoadTypegenApplicationOptions {
	/** Names the exported UltimaBase or FrameworkApplication instance. */
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
	if (options.sourcePath.trim() === '') {
		throw new TypeError('sourcePath must be a non-empty string')
	}

	if (options.exportName.trim() === '') {
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

	if (candidate instanceof UltimaBase) {
		return candidate.application
	}

	if (isTypegenApplication(candidate)) {
		return candidate
	}

	const nestedApplication =
		typeof candidate === 'object' && candidate !== null
			? readProperty(candidate, 'application')
			: undefined

	if (isTypegenApplication(nestedApplication)) {
		return nestedApplication
	}

	throw new SchemaTypegenError(
		'invalid-application-export',
		`Export "${options.exportName}" from "${sourcePath}" must be an UltimaBase or FrameworkApplication instance`,
		{ owner: options.exportName, path: sourcePath },
	)
}
