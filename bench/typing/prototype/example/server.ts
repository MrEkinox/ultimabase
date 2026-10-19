import { App } from './app.ts'
import { Post } from './post.ts'
import { Tag } from './tag.ts'
import { User } from './user.ts'

export const app = App.build({ models: [Post, User, Tag] })
await app.start()
