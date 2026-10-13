import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The part of Vitest's `test` configuration `ultimabaseTesting()` returns;
 * spread it first so your own values win.
 */
export interface UltimaBaseTestingConfig {
	/** Starts PostgreSQL once per run unless `TEST_DATABASE_URL` is set. */
	readonly globalSetup: string[]
	/** Stops the application and drops the worker schema after each file. */
	readonly setupFiles: string[]
	/**
	 * `PORT=0`: a server plugin listens on a free port, so workers never
	 * compete for the development port.
	 */
	readonly env: Record<string, string>
	/**
	 * `--no-experimental-require-module`: Node.js then resolves packages
	 * with the same conditions as Vite (without `module-sync`), so a package
	 * shipping both ESM and CommonJS builds, such as `graphql`, loads once
	 * whether a test file or a dependency imports it.
	 */
	readonly execArgv: string[]
	/** Starting an application includes synchronizing its tables. */
	readonly testTimeout: number
	readonly hookTimeout: number
}

// Beside this module: `.js` once built, `.ts` when run from source.
const resolveModule = (name: string): string => {
	const file = fileURLToPath(import.meta.url)
	return path.join(path.dirname(file), `${name}${path.extname(file)}`)
}

/**
 * Configures Vitest for `testApplication` (ADR-0327): PostgreSQL started once
 * (or `TEST_DATABASE_URL`), one schema per worker, cleanup after each file.
 *
 * @example
 * ```ts
 * import { ultimabaseTesting } from '@ultimabase/testing/vitest'
 * import { defineConfig } from 'vitest/config'
 *
 * export default defineConfig({ test: { ...ultimabaseTesting() } })
 * ```
 */
export const ultimabaseTesting = (): UltimaBaseTestingConfig => ({
	globalSetup: [resolveModule('vitest-global-setup')],
	setupFiles: [resolveModule('vitest-setup-file')],
	env: { PORT: '0' },
	// Vite resolves without `module-sync`; the workers must resolve alike, or
	// a dual package has two instances and `instanceof` fails across them.
	execArgv: ['--no-experimental-require-module'],
	testTimeout: 30_000,
	hookTimeout: 30_000,
})
