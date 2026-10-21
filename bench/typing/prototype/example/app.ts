// The application (D-24): the plugins the models use, and every model.
import {
	aclPlugin,
	authPlugin,
	defineApp,
	graphqlPlugin,
	memory,
	softDeletePlugin,
} from '../index.ts'
import { Post } from './post.ts'
import { Tag } from './tag.ts'
import { User } from './user.ts'

export const app = defineApp({
	database: memory(),
	plugins: [softDeletePlugin(), aclPlugin(), graphqlPlugin(), authPlugin()],
	models: [Post, User, Tag],
})
