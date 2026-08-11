import path from 'node:path'

import { definePlugin, type FrameworkPlugin } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { generateApplicationTypesFromSnapshot } from './generator.js'
import { createCompiledTypegenSnapshot } from './snapshot.js'
import { writeGeneratedTypeFile } from './writer.js'

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

/** Represents automatic startup generation for one application registry. */
export type TypegenPlugin = FrameworkPlugin<
	typeof typegenPluginName,
	Promise<Readonly<TypegenPluginExports>>,
	undefined,
	undefined,
	undefined,
	undefined,
	'schema-typegen'
>

interface NormalizedTypegenPluginOptions {
	readonly applicationId: string
	readonly outputPath: string
}

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
): TypegenPlugin =>
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: typegenPluginName,
		slot: 'schema-typegen',
		setup: async ({ fieldBuilderMethods, schemas }) => {
			const generated = generateApplicationTypesFromSnapshot(
				createCompiledTypegenSnapshot(
					{
						fieldBuilderMethods,
						schemas,
					},
					normalized.applicationId,
				),
			)

			await writeGeneratedTypeFile({
				applicationId: normalized.applicationId,
				contents: generated.contents,
				outputPath: normalized.outputPath,
			})

			return immutableRecord({
				fingerprint: generated.fingerprint,
				outputPath: normalized.outputPath,
			}) satisfies TypegenPluginExports
		},
	})

/**
 * Regenerates the complete application declaration before infrastructure starts.
 * A future CLI will reuse the same generator for explicit manual generation.
 */
export const typegenPlugin = (options?: TypegenPluginOptions): TypegenPlugin =>
	createTypegenPlugin(normalizeOptions(options))
