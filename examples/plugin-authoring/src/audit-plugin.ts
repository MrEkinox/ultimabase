//#region audit-plugin
import { definePlugin, type DefinedPlugin } from '@ultimabase/plugin-kit'

/**
 * `.with({ audit: true })` logs each committed write of the schema. The
 * return annotation names the rule's type: with an inferred one, an
 * application declared in `Register` fails with TS2589 as soon as a schema
 * calls `.with(...)`.
 */
export const auditPlugin = (): DefinedPlugin<
	'@example/audit-plugin',
	Readonly<Record<never, never>>,
	{ audit: boolean }
> =>
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
