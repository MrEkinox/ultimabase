import { formatPluginIdentity } from '../plugins/manifest.js'
import type { PluginPrivilegeReport } from './plugin-privilege-policy.js'

const count = (value: number, noun: string): string =>
	`${String(value)} ${noun}${value === 1 ? '' : 's'}`

/**
 * Formats the one `info` line Core logs after a successful start (ADR-0313):
 * schema count, plugin names in graph order and critical privileges with the
 * plugins requesting them.
 */
export const formatStartupSummary = (
	schemaCount: number,
	report: PluginPrivilegeReport,
): string => {
	const plugins = report.plugins.map(({ identity }) =>
		formatPluginIdentity(identity),
	)
	const critical = new Map<string, string[]>()
	for (const plugin of report.plugins) {
		for (const privilege of plugin.privileges) {
			if (privilege.severity !== 'critical') continue
			const owners = critical.get(privilege.name) ?? []
			owners.push(formatPluginIdentity(plugin.identity))
			critical.set(privilege.name, owners)
		}
	}
	const pluginList =
		plugins.length === 0
			? count(0, 'plugin')
			: `${count(plugins.length, 'plugin')} (${plugins.join(', ')})`
	const privileges =
		critical.size === 0
			? 'no critical privileges'
			: `critical privileges: ${[...critical]
					.map(([name, owners]) => `${name} (${owners.join(', ')})`)
					.join(', ')}`
	return `UltimaBase started: ${count(schemaCount, 'schema')}, ${pluginList}; ${privileges}. Use logLevel 'debug' for the privilege report.`
}
