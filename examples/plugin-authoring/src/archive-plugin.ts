//#region archive-plugin
import { dateTimeField } from '@ultimabase/core'
import { command, definePlugin, shapeMethod } from '@ultimabase/plugin-kit'

/** `.archivable()` adds a server-written `archivedAt` and two commands. */
export const archivePlugin = () =>
	definePlugin({
		name: '@example/archive-plugin',
		shape: {
			archivable: shapeMethod({
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
