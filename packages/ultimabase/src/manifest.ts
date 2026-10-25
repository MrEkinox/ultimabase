// A plugin's manifest (D-57, D-95): checked by `definePlugin`, its ranges
// matched at `start` against the running kernel and the installed plugins.
import { satisfies, valid, validRange } from 'semver'
import kernel from '../package.json' with { type: 'json' }
import type { Logger } from './app-options.ts'
import type { PluginRecord } from './definition.ts'
import type { Manifest } from './plugin.ts'
import { isObject } from './query-where.ts'

/** Checks a plugin's `manifest`: a name, a version and valid ranges. */
export function manifestOf(value: unknown, plugin: string): Manifest {
	const path = `${plugin}.manifest`
	if (!isObject(value)) throw new TypeError(`${path} is an object.`)
	const { name, version, peerDependencies } = value
	if (typeof name !== 'string' || name === '') {
		throw new TypeError(`${path}.name is a package name.`)
	}
	if (typeof version !== 'string' || valid(version) === null) {
		throw new TypeError(`${path}.version is a version, not ${String(version)}.`)
	}
	if (peerDependencies === undefined) return Object.freeze({ name, version })
	if (!isObject(peerDependencies)) {
		throw new TypeError(`${path}.peerDependencies is an object.`)
	}
	const ranges: { [name: string]: string } = {}
	for (const [peer, range] of Object.entries(peerDependencies)) {
		if (typeof range !== 'string' || validRange(range) === null) {
			throw new TypeError(
				`${path}.peerDependencies.${peer} is a version range, not ${String(range)}.`,
			)
		}
		ranges[peer] = range
	}
	return Object.freeze({
		name,
		version,
		peerDependencies: Object.freeze(ranges),
	})
}

// A prerelease of the kernel runs the plugins written for its version range.
const accepts = (version: string, range: string): boolean =>
	satisfies(version, range, { includePrerelease: true })

/**
 * Refuses a plugin whose ranges exclude the running kernel or an installed
 * plugin, naming both versions; warns of one that gives the kernel no range.
 */
export function checkVersions(
	plugins: readonly PluginRecord[],
	logger: Logger,
): void {
	const installed = new Map<string, string>([[kernel.name, kernel.version]])
	for (const { code } of plugins) {
		installed.set(code.manifest.name, code.manifest.version)
	}
	for (const { code } of plugins) {
		const { name, version, peerDependencies = {} } = code.manifest
		if (peerDependencies[kernel.name] === undefined) {
			logger.warn(`${name} declares no ${kernel.name} range.`)
		}
		for (const [peer, range] of Object.entries(peerDependencies)) {
			const found = installed.get(peer)
			if (found === undefined || accepts(found, range)) continue
			throw new Error(
				`${name} ${version} needs ${peer} ${range}; this is ${peer} ${found}.`,
			)
		}
	}
}
