import { dateTimeField } from '@ultimabase/core'
import { command, definePlugin, shapeMethod } from '@ultimabase/plugin-kit'

// Unannotated `definePlugin` factories installed in the registered
// application: typing their rules, fields and commands must not read
// `Register` (TS2589 at `App.Schema.define` otherwise).
export const archivePlugin = () =>
	definePlugin({
		name: '@register-cycle/archive',
		shape: {
			archivable: shapeMethod({
				fields: { archivedAt: dateTimeField() },
				commands: {
					archiveOne: command({ authority: 'request', effect: 'update' }),
					archiveMany: command({
						authority: 'request',
						effect: 'update',
						target: 'many',
					}),
				},
				permissions: ['readArchived'],
			}),
		},
		rules: {
			archiveReason: (value, path) => {
				if (typeof value !== 'string') throw new TypeError(`${path}: text`)
				return value
			},
		},
	})

export const auditPlugin = () =>
	definePlugin({
		name: '@register-cycle/audit',
		rules: { audit: (value: unknown): boolean => value === true },
		afterCommit: ({ rules }) => void rules.audit,
	})
