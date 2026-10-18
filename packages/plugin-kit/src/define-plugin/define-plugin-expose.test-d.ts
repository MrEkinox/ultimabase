import { UltimaBase, dateTimeField } from '@ultimabase/core'
import { test } from 'vitest'

import { command, definePlugin, feature } from '../index.js'

const archive = feature({
	fields: { archivedAt: dateTimeField() },
	commands: {
		archiveOne: command({ authority: 'request', effect: 'update' }),
		archiveMany: command({
			authority: 'request',
			effect: 'update',
			target: 'many',
		}),
		purgeOne: command({ authority: 'master', effect: 'delete' }),
	},
})

// ADR-0347 decision 2 and amendment item 3: `expose` offers the operation
// key and the `One` method key of request commands with target one only.
test('expose offers the request one-row commands of the schema', () => {
	const App = UltimaBase.use(
		definePlugin({
			name: '@community/archive-expose',
			features: { archivable: archive },
		}),
	)
	const Post = App.Schema.define({
		className: 'TypedExposePost',
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	})
	const Plain = App.Schema.define({
		className: 'TypedExposePlain',
		fields: (field) => ({ title: field.string() }),
	})

	Post.with({ expose: { archive: true, write: false } })
	Post.with({ expose: { archiveOne: false, read: true } })
	// @ts-expect-error -- transports serve no target-many plugin command.
	Post.with({ expose: { archiveMany: true } })
	// @ts-expect-error -- Master commands are never exposed.
	Post.with({ expose: { purgeOne: true } })
	// @ts-expect-error -- Master commands form no exposable operation.
	Post.with({ expose: { purge: true } })
	// @ts-expect-error -- the command exists only with its feature.
	Plain.with({ expose: { archive: true } })
})
