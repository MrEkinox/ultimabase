import { contributeApplication, plugin, UltimaBase } from '../../src/index.js'

const database = plugin({
	core: '^0.0.0',
	id: 'fixture.configured-database',
	version: '1.0.0',
	contributions: [
		contributeApplication(() => ({
			exports: { dialect: 'fixture' as const },
		})),
	],
})
const transport = plugin({
	core: '^0.0.0',
	id: 'fixture.configured-transport',
	version: '1.0.0',
	contributions: [],
})

export const DatabaseApplication = UltimaBase./* hover:use */ use(database)
export const Application = DatabaseApplication./* hover:append */ use(transport)
export const Post = Application./* hover:schema */ Schema.define({
	className: 'ConfiguredLanguagePost',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

export const application = new Application({
	/* completion:options */
	schemas: [Post],
})

export const configuredFactory = /* hover:factory */ Application
export const pluginExports = application./* hover:plugin */ plugin(database)
export const lifecycle = application./* completion:lifecycle */ start()
