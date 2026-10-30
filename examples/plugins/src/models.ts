// The model: an article that uses the publishing plugin, with a color of
// its palette.
//#region article
import { allow, defineModel } from 'ultimabase'
import { color } from './plugins/color.ts'
import { publishing } from './plugins/publishing.ts'

export const palette = ['#1d4ed8', '#b91c1c', '#15803d']

export const Article = defineModel({
	name: 'Article',
	// A new article is a draft until an editor publishes it.
	use: [publishing()],
	fields: (f) => ({
		title: f.string(),
		accent: color({ palette, default: '#1d4ed8' }),
	}),
}).with({
	access: { read: allow.public, write: ({ caller }) => caller.kind === 'user' },
})
//#endregion

//#region news
// Published as soon as it is written.
export const News = defineModel({
	name: 'News',
	use: [publishing({ publishOnCreate: true })],
	fields: (f) => ({ title: f.string() }),
}).with({
	access: {
		read: allow.public,
		create: ({ caller }) => caller.kind === 'user',
	},
})
//#endregion
