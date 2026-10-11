// Command plugin: `.archivable()` adds `archivedAt`, `archiveOne`, `archiveMany`
// and `unarchiveOne` (ADR-0316).
import { dateTimeField } from '@ultimabase/core'
import { command, definePlugin, shapeMethod } from '@ultimabase/plugin-kit'

const archived = () => ({ archivedAt: new Date().toISOString() })

export const archivePlugin = () =>
	definePlugin({
		name: '@community/archive',
		shape: {
			archivable: shapeMethod({
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
