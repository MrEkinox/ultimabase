import { randomUUID } from 'node:crypto'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { SchemaTypegenError } from './errors.js'

const fingerprintPattern =
	/^\/\/ @ultimabase\/schema-fingerprint sha256:([a-f0-9]{64})$/mu

/** Reads the deterministic fingerprint embedded in one generated declaration. */
export const readGeneratedTypeFingerprint = (
	contents: string,
): string | undefined => fingerprintPattern.exec(contents)?.[1]

export interface GeneratedTypeFile {
	/** Identifies the application that owns this destination in conflict diagnostics. */
	readonly applicationId: string
	/** Contains one complete declaration carrying a valid embedded fingerprint. */
	readonly contents: string
	/** Names the application-owned artifact replaced through a sibling rename. */
	readonly outputPath: string
}

const validateGeneratedTypeFile = (file: GeneratedTypeFile): void => {
	if (file.applicationId.trim() === '') {
		throw new TypeError(
			'generated file applicationId must be a non-empty string',
		)
	}

	if (file.outputPath.trim() === '') {
		throw new TypeError('generated file outputPath must be a non-empty string')
	}

	if (readGeneratedTypeFingerprint(file.contents) === undefined) {
		throw new TypeError(
			'generated file contents must contain a schema fingerprint',
		)
	}
}

const writeOneGeneratedTypeFile = async (
	file: GeneratedTypeFile,
): Promise<void> => {
	const outputPath = path.resolve(file.outputPath)
	const directory = path.dirname(outputPath)
	const temporaryPath = path.join(
		directory,
		`.${path.basename(outputPath)}.${randomUUID()}.tmp`,
	)

	await mkdir(directory, { recursive: true })

	try {
		await writeFile(temporaryPath, file.contents, 'utf8')
		await rename(temporaryPath, outputPath)
	} catch (error: unknown) {
		try {
			await unlink(temporaryPath)
		} catch {
			// A failed write or completed rename legitimately leaves no temporary file.
		}

		throw error
	}
}

/** Atomically replaces one complete generated declaration. */
export const writeGeneratedTypeFile = async (
	file: GeneratedTypeFile,
): Promise<void> => {
	validateGeneratedTypeFile(file)
	await writeOneGeneratedTypeFile(file)
}

/** Rejects duplicate destinations before atomically replacing any output. */
export const writeGeneratedTypeFiles = async (
	files: readonly GeneratedTypeFile[],
): Promise<void> => {
	const ownersByPath = new Map<string, string>()

	for (const file of files) {
		validateGeneratedTypeFile(file)

		const outputPath = path.resolve(file.outputPath)
		const owner = ownersByPath.get(outputPath)

		if (owner !== undefined) {
			throw new SchemaTypegenError(
				'output-path-conflict',
				`Generated output "${outputPath}" from "${file.applicationId}" conflicts with "${owner}"`,
				{ owner: file.applicationId, path: outputPath },
			)
		}

		ownersByPath.set(outputPath, file.applicationId)
	}

	for (const file of files) {
		await writeOneGeneratedTypeFile(file)
	}
}
