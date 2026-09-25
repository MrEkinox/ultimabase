import path from 'node:path'

import {
	contributeApplication,
	plugin,
	type PluginInstance,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { generateApplicationTypesFromSnapshot } from './generator.js'
import { createCompiledTypegenSnapshot } from './snapshot.js'
import { writeGeneratedTypeFiles } from './writer.js'

const typegenPluginName = '@ultimabase/typegen' as const
const defaultApplicationId = 'main'
const defaultOutputPath = '.ultimabase/schema.generated.d.ts'
/** Configures automatic full type generation during application startup. */
export interface TypegenPluginOptions {
	/** Identifies this application in its generated fingerprint. @default "main" */
	readonly applicationId?: string
	/** Selects the declaration replaced atomically at startup. @default ".ultimabase/schema.generated.d.ts" */
	readonly outputPath?: string
}

/** Describes the generated artifact available after plugin setup. */
export interface TypegenPluginExports {
	readonly fingerprint: string
	readonly outputPath: string
}

interface NormalizedTypegenPluginOptions {
	readonly applicationId: string
	readonly outputPath: string
}

/** Represents automatic startup generation for one application registry. */
export type TypegenPlugin = PluginInstance<{
	readonly id: typeof typegenPluginName
	readonly exports: Readonly<TypegenPluginExports>
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly environment: readonly ['environment:filesystem']
}>

const normalizeOptions = (
	options: TypegenPluginOptions | undefined,
): NormalizedTypegenPluginOptions => {
	if (options !== undefined && !isPlainRecord(options)) {
		throw new TypeError('typegen options must be a plain object')
	}

	for (const key of Reflect.ownKeys(options ?? {})) {
		if (key !== 'applicationId' && key !== 'outputPath') {
			throw new TypeError(`Unknown typegen option: ${String(key)}`)
		}
	}

	const applicationId = options?.applicationId ?? defaultApplicationId
	const outputPath = options?.outputPath ?? defaultOutputPath

	if (typeof applicationId !== 'string' || applicationId.trim() === '') {
		throw new TypeError('typegen applicationId must be a non-empty string')
	}

	if (typeof outputPath !== 'string' || outputPath.trim() === '') {
		throw new TypeError('typegen outputPath must be a non-empty string')
	}

	return immutableRecord({
		applicationId,
		outputPath: path.resolve(outputPath),
	})
}

const createTypegenPlugin = (
	normalized: NormalizedTypegenPluginOptions,
): TypegenPlugin => {
	const application = contributeApplication(
		async ({
			fieldBuilderMethods,
			pluginFieldTypes,
			schemas,
			typegenGraph,
		}) => {
			const generated = generateApplicationTypesFromSnapshot(
				createCompiledTypegenSnapshot(
					{
						fieldBuilderMethods,
						pluginFieldTypes,
						schemas,
						typegenGraph,
					},
					normalized.applicationId,
				),
			)

			await writeGeneratedTypeFiles([
				{
					applicationId: normalized.applicationId,
					contents: generated.contents,
					outputPath: normalized.outputPath,
				},
			])

			return {
				exports: immutableRecord({
					fingerprint: generated.fingerprint,
					outputPath: normalized.outputPath,
				}) satisfies TypegenPluginExports,
			}
		},
	)
	const instance = plugin({
		id: typegenPluginName,
		version: '0.0.0',
		core: '^0.0.0',
		environment: ['environment:filesystem'],
		contributions: [application],
	})
	return instance
}

/**
 * Regenerates the complete application declaration before infrastructure starts.
 * A future CLI will reuse the same generator for explicit manual generation.
 */
export const typegenPlugin = (options?: TypegenPluginOptions): TypegenPlugin =>
	createTypegenPlugin(normalizeOptions(options))
