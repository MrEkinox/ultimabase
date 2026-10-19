// Rule statements kept in a separate module. Nothing imports it in the fixture: its rule is
// silently absent from the application (K' cannot detect it). Imported after registration,
// it throws (sealed schema).
import { Tag } from './tag.ts'

Tag.hooks({
	beforeSave: ({ item }) => {
		if (item.name.trim() === '') throw new TypeError('empty tag')
	},
})
