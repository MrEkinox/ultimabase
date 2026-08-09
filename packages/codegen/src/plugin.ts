import path from 'node:path'

import { definePlugin, type FrameworkPlugin } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { generateApplicationTypesFromSnapshot } from './generator.js'
import { createCompiledTypegenSnapshot } from './snapshot.js'
import { writeGeneratedTypeFile } from './writer.js'

const codegenPluginName = '@ultimabase/codegen' as const
const defaultApplicationId = 'main'
const defaultOutputPath = '.ultimabase/schema.generated.d.ts'

/** Configures automatic full type generation during application startup. */
export interface CodegenPluginOptions {
	/** Identifies this application in its generated fingerprint. @default "main" */
	readonly applicationId?: string
	/** Selects the declaration replaced atomically at startup. @default ".ultimabase/schema.generated.d.ts" */
	readonly outputPath?: string
}

/** Describes the generated artifact available after plugin setup. */
export interface CodegenPluginExports {
	readonly fingerprint: string
	readonly outputPath: string
}

/** Represents automatic startup generation for one application registry. */
export type CodegenPlugin = FrameworkPlugin<
	typeof codegenPluginName,
	Promise<Readonly<CodegenPluginExports>>,
	undefined,
	undefined,
	undefined,
	undefined,
	'schema-typegen'
>

interface NormalizedCodegenPluginOptions {
	readonly applicationId: string
	readonly outputPath: string
}

const normalizeOptions = (
	options: CodegenPluginOptions | undefined,
): NormalizedCodegenPluginOptions => {
	if (options !== undefined && !isPlainRecord(options)) {
		throw new TypeError('codegen options must be a plain object')
	}

	for (const key of Reflect.ownKeys(options ?? {})) {
		if (key !== 'applicationId' && key !== 'outputPath') {
			throw new TypeError(`Unknown codegen option: ${String(key)}`)
		}
	}

	const applicationId = options?.applicationId ?? defaultApplicationId
	const outputPath = options?.outputPath ?? defaultOutputPath

	if (typeof applicationId !== 'string' || applicationId.trim() === '') {
		throw new TypeError('codegen applicationId must be a non-empty string')
	}

	if (typeof outputPath !== 'string' || outputPath.trim() === '') {
		throw new TypeError('codegen outputPath must be a non-empty string')
	}

	return immutableRecord({
		applicationId,
		outputPath: path.resolve(outputPath),
	})
}

const createCodegenPlugin = (
	normalized: NormalizedCodegenPluginOptions,
): CodegenPlugin =>
	definePlugin({
		name: codegenPluginName,
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
			}) satisfies CodegenPluginExports
		},
	})

/**
 * Regenerates the complete application declaration before infrastructure starts.
 * A future CLI will reuse the same generator for explicit manual generation.
 */
export const codegenPlugin = (options?: CodegenPluginOptions): CodegenPlugin =>
	createCodegenPlugin(normalizeOptions(options))
