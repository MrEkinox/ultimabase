import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
	mkdir,
	mkdtemp,
	readdir,
	rename,
	rm,
	rmdir,
	stat,
	writeFile,
} from 'node:fs/promises'
import path from 'node:path'

import { renderBaseFiles, writesEnv } from './base-template.js'
import { isPluginId } from './catalog.js'
import type { InitializerPlan, PackageManager } from './config.js'
import { needsMasterKey } from './security-template.js'

export interface ProjectGenerationOptions {
	readonly installDependencies?: (
		directory: string,
		manager: PackageManager,
	) => Promise<void>
	readonly onProgress?: (message: string) => void
}

const installDependencies = (
	directory: string,
	manager: PackageManager,
): Promise<void> =>
	new Promise((resolve, reject) => {
		const child = spawn(manager, ['install'], {
			cwd: directory,
			stdio: 'inherit',
			shell: false,
		})
		child.once('error', (error) => {
			reject(new Error(`Could not start ${manager} install: ${error.message}`))
		})
		child.once('exit', (code, signal) => {
			if (code === 0) resolve()
			else
				reject(
					new Error(
						`${manager} install failed (${signal ?? `exit ${String(code)}`}). The destination was not created; retry when dependencies are available.`,
					),
				)
		})
	})

/**
 * Work stays in an owned sibling until every file and optional install succeeds.
 * An exclusive destination reservation prevents replacement of an existing path.
 */
export const createProject = async (
	plan: InitializerPlan,
	options: ProjectGenerationOptions = {},
): Promise<void> => {
	// Every catalog plugin has a template; hand-built JavaScript plans may list others.
	const planned: readonly string[] = plan.plugins
	const unsupported = planned.filter((id) => !isPluginId(id))
	if (unsupported.length > 0) {
		throw new Error(
			`Templates for ${unsupported.map((id) => `@ultimabase/${id}`).join(', ')} are not implemented yet. Choose currently supported plugins for now.`,
		)
	}
	const parent = path.dirname(plan.destination)
	const parentStat = await stat(parent).catch(() => undefined)
	if (!parentStat?.isDirectory())
		throw new Error(`Destination parent directory does not exist: ${parent}`)
	const temporary = await mkdtemp(path.join(parent, '.ultimabase-create-'))
	let reserved = false
	try {
		const docker = plan.database === 'docker'
		const files = renderBaseFiles(
			plan,
			docker ? randomBytes(24).toString('hex') : undefined,
			writesEnv(plan) && needsMasterKey(plan)
				? randomBytes(32).toString('hex')
				: undefined,
		)
		options.onProgress?.('Writing project files')
		for (const [relative, contents] of files) {
			if (relative === '.env') continue
			const target = path.join(temporary, relative)
			await mkdir(path.dirname(target), { recursive: true })
			await writeFile(target, contents)
		}
		if (plan.install) {
			options.onProgress?.(
				`Installing dependencies with ${plan.packageManager}`,
			)
			await (options.installDependencies ?? installDependencies)(
				temporary,
				plan.packageManager,
			)
		}
		// Keep local credentials out of dependency lifecycle scripts.
		const localEnv = files.get('.env')
		if (localEnv !== undefined) {
			await writeFile(path.join(temporary, '.env'), localEnv, { mode: 0o600 })
		}
		// mkdir is exclusive and fails for files, symlinks, and existing directories.
		await mkdir(plan.destination)
		reserved = true
		await rename(temporary, plan.destination)
		reserved = false
		options.onProgress?.('Project ready')
	} catch (error) {
		await rm(temporary, { recursive: true, force: true })
		if (reserved) {
			// Only release our still-empty reservation; never remove another writer's files.
			const entries = await readdir(plan.destination).catch(() => ['occupied'])
			if (entries.length === 0)
				await rmdir(plan.destination).catch(() => undefined)
		}
		throw error
	}
}
