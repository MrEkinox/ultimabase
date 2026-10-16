// Command plugin: `archivable: true` adds `archivedAt`, `archiveOne`, `archiveMany`
// and `unarchiveOne` (ADR-0316).
import { dateTimeField } from '@ultimabase/core'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'

const archived = () => ({ archivedAt: new Date().toISOString() })

export const archivePlugin = () =>
	definePlugin({
		name: '@community/archive',
		features: {
			archivable: feature({
				fields: { archivedAt: dateTimeField() },
				commands: {
					archiveOne: command({
						authority: 'request',
						effect: 'update',
						data: archived,
					}),
					archiveMany: command({
						authority: 'request',
						effect: 'update',
						data: archived,
						target: 'many',
					}),
					unarchiveOne: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: null }),
					}),
				},
			}),
		},
	})
