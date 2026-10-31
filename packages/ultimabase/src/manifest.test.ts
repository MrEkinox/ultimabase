// The manifest's version checks (D-57, D-95): `definePlugin` refuses an
// invalid manifest, `start` a range that excludes the kernel or a plugin;
// a plugin of the application has no manifest (D-172).
import { afterEach, describe, expect, it } from 'vitest'
import kernel from '../package.json' with { type: 'json' }
import type { Logger, PluginTypes } from './index.ts'
import { defineApp, defineModel, definePlugin, memory } from './index.ts'
import type { Manifest } from './plugin.ts'

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

const warnings: unknown[] = []
const recorder: Logger = {
	info: () => undefined,
	warn: (first) => {
		warnings.push(first)
	},
	error: () => undefined,
	child: () => recorder,
}

interface Any extends PluginTypes {
	readonly name: string
}
const plugin = (manifest: Manifest) =>
	definePlugin<Any>({ name: manifest.name, manifest }).plugin()
const app = (...manifests: Manifest[]) =>
	defineApp({
		database: memory(),
		models: [Note],
		plugins: manifests.map(plugin),
		logger: recorder,
	})
const kernelRange = { ultimabase: '*' }

/** `definePlugin` with a manifest its types would refuse. */
const defined = (manifest: unknown) => (): void => {
	Reflect.apply(definePlugin, undefined, [{ name: 'p', manifest }])
}

let running: ReturnType<typeof app> | undefined
afterEach(async () => {
	warnings.length = 0
	await running?.stop()
	running = undefined
})
const started = async (...manifests: Manifest[]): Promise<void> => {
	running = app(...manifests)
	await running.start()
}

describe('definePlugin', () => {
	it('refuses a manifest without a name or a valid version', () => {
		expect(defined(null)).toThrow(new TypeError('p.manifest is an object.'))
		expect(defined({ name: '', version: '1.0.0' })).toThrow(
			new TypeError('p.manifest.name is a package name.'),
		)
		expect(defined({ name: 'p', version: '1.0' })).toThrow(
			new TypeError('p.manifest.version is a version, not 1.0.'),
		)
	})

	it('refuses a peer range that is not one', () => {
		expect(
			defined({ name: 'p', version: '1.0.0', peerDependencies: 1 }),
		).toThrow(new TypeError('p.manifest.peerDependencies is an object.'))
		const peerDependencies = { ultimabase: '^1.x.y.z' }
		expect(defined({ name: 'p', version: '1.0.0', peerDependencies })).toThrow(
			new TypeError(
				'p.manifest.peerDependencies.ultimabase is a version range, not ^1.x.y.z.',
			),
		)
	})
})

describe('start', () => {
	it('refuses a plugin whose range excludes the kernel', async () => {
		const archive = app({
			name: 'ultimabase-archive',
			version: '1.0.0',
			peerDependencies: { ultimabase: '>99.0.0' },
		})
		await expect(archive.start()).rejects.toThrow(
			`ultimabase-archive 1.0.0 needs ultimabase >99.0.0; this is ultimabase ${kernel.version}.`,
		)
	})

	it('refuses a plugin whose range excludes an installed plugin', async () => {
		const auth = { name: 'ultimabase-auth', version: '1.1.0' }
		const archive = app(
			{ ...auth, peerDependencies: kernelRange },
			{
				name: 'ultimabase-archive',
				version: '1.0.0',
				peerDependencies: { ...kernelRange, 'ultimabase-auth': '^2.0.0' },
			},
		)
		await expect(archive.start()).rejects.toThrow(
			'ultimabase-archive 1.0.0 needs ultimabase-auth ^2.0.0; this is ultimabase-auth 1.1.0.',
		)
	})

	it('accepts a prerelease in range and ignores a peer not installed', async () => {
		await started(
			{
				name: 'ultimabase-auth',
				version: '1.3.0-beta.1',
				peerDependencies: kernelRange,
			},
			{
				name: 'ultimabase-archive',
				version: '1.0.0',
				peerDependencies: {
					...kernelRange,
					'ultimabase-auth': '^1.0.0',
					'ultimabase-files': '^1.0.0',
				},
			},
		)
		expect(warnings).toEqual([])
	})

	it('checks no plugin of the application, which no peer names (D-172)', async () => {
		const own = definePlugin<Any>({ name: 'maintenance' }).plugin()
		running = defineApp({
			database: memory(),
			models: [Note],
			plugins: [
				own,
				plugin({
					name: 'ultimabase-archive',
					version: '1.0.0',
					peerDependencies: { ...kernelRange, maintenance: '^2.0.0' },
				}),
			],
			logger: recorder,
		})
		await running.start()
		expect(warnings).toEqual([])
	})

	it('warns of a plugin that gives the kernel no range', async () => {
		await started({ name: 'ultimabase-archive', version: '1.0.0' })
		expect(warnings).toEqual([
			'ultimabase-archive declares no ultimabase range.',
		])
	})
})
