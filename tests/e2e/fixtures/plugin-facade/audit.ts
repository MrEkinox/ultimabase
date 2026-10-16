// Rule plugin: `plugins.audit(true)` reports committed writes (ADR-0316).
import { definePlugin } from '@ultimabase/plugin-kit'

export const auditPlugin = (log: (line: string) => void) =>
	definePlugin({
		name: '@community/audit',
		rules: {
			audit: (value, path) => {
				if (typeof value !== 'boolean') {
					throw new TypeError(`${path} must be a boolean`)
				}
				return value
			},
		},
		afterCommit: ({ className, operation, rules }) => {
			if (rules.audit === true) log(`${className} ${operation}`)
		},
	})
