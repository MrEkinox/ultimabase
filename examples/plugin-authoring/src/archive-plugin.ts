//#region archive-plugin
import { dateTimeField } from '@ultimabase/core'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'

/** `archivable: true` adds a server-written `archivedAt` and two commands. */
export const archivePlugin = () =>
	definePlugin({
		name: '@example/archive-plugin',
		features: {
			archivable: feature({
				fields: { archivedAt: dateTimeField() },
				commands: {
					archiveOne: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: new Date().toISOString() }),
					}),
					archiveMany: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: new Date().toISOString() }),
						target: 'many',
					}),
				},
			}),
		},
	})
//#endregion archive-plugin
