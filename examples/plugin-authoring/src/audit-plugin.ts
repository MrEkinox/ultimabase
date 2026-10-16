//#region audit-plugin
import { definePlugin } from '@ultimabase/plugin-kit'

/** `plugins.audit(true)` logs each committed write of the schema. */
export const auditPlugin = () =>
	definePlugin({
		name: '@example/audit-plugin',
		rules: {
			audit: (value, path) => {
				if (typeof value !== 'boolean')
					throw new TypeError(`${path} must be a boolean`)
				return value
			},
		},
		afterCommit: ({ className, operation, rules }) => {
			if (rules.audit === true)
				console.info(`[audit] ${className} ${operation}`)
		},
	})
//#endregion audit-plugin
