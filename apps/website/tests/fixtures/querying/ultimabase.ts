import { UltimaBase } from '@ultimabase/core'

import { Channel, Message } from './contextual-relations.ts'
import './generated-types.ts'
import { Author, Comment, Post } from './schemas.ts'

export const ultimabase = new UltimaBase({
	plugins: [],
	schemas: [Author, Comment, Post, Channel, Message],
})
