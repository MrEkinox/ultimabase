// The models the kernel's tests run on `memory()`: every 0.1 field type, a
// one-to-many, a one-to-one and a many-to-many relation.
import { defineApp, defineModel, memory } from '../index.ts'

export const Author = defineModel({
	name: 'Author',
	fields: (f) => ({
		name: f.string({ unique: true }),
		level: f.enumOf(['junior', 'senior'], { default: 'junior' }),
		books: f.many(() => Book),
		profile: f.one(() => Profile, { optional: true }),
	}),
})

export const Profile = defineModel({
	name: 'Profile',
	fields: (f) => ({
		bio: f.string({ optional: true }),
		author: f.one(() => Author),
	}),
})

export const Book = defineModel({
	name: 'Book',
	fields: (f) => ({
		title: f.string(),
		pages: f.number({ optional: true }),
		published: f.boolean({ default: false }),
		meta: f.json({ optional: true }),
		releasedAt: f.date({ optional: true }),
		author: f.one(() => Author),
		tags: f.many(() => Tag),
	}),
	indexes: [{ fields: ['title', 'author'], unique: true }],
})

export const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		label: f.string({ unique: true }),
		books: f.many(() => Book),
	}),
})

/** A fresh application on a fresh `memory()`. */
export const library = () =>
	defineApp({
		database: memory(),
		models: [Author, Profile, Book, Tag],
	})
