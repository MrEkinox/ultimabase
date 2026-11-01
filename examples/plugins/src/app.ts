// The application: its plugins, beside the models and functions.
//#region app
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'
import { titles, whoami } from './functions.ts'
import { Member } from './member.ts'
import { Article, News } from './models.ts'
import { apiKeysPlugin } from './plugins/api-keys.ts'
import { colorPlugin } from './plugins/color.ts'
import { membersPlugin } from './plugins/members.ts'
import { publishingPlugin } from './plugins/publishing.ts'
import { rpcPlugin } from './plugins/rpc.ts'

export const app = defineApp({
	database: memory(),
	masterKey: 'dev-master-key',
	plugins: [
		httpPlugin(),
		rpcPlugin(),
		apiKeysPlugin(),
		publishingPlugin(),
		colorPlugin(),
		membersPlugin(),
	],
	models: [Article, News, Member],
	functions: [whoami, titles],
})
//#endregion
