import { QueryBuilder, Schema, type SchemaResult } from '../../src/index.js'

const PackedRelationTag = Schema.define({
	className: 'PackedRelationTag',
	fields: (field) => ({ label: field.string() }),
})
const PackedRelationArticle = Schema.define({
	className: 'PackedRelationArticle',
	fields: (field) => ({
		tags: field.relation({ target: () => PackedRelationTag }),
		title: field.string(),
	}),
})

declare const article: SchemaResult<typeof PackedRelationArticle>
const /* hover:relation-handle */ tags = article.relation('tags')
const /* hover:relation-query */ tagQuery = tags.findMany({
		select: { id: true, label: true },
	})
const connectTag = () =>
	tags./* hover:relation-connect */ connect(PackedRelationTag.pointer('tag-id'))
const relatedArticleQuery = new QueryBuilder(PackedRelationArticle).where(
	(where) =>
		where./* hover:relation-predicate */ some('tags', (tag) =>
			tag.eq('label', 'typed'),
		),
)

void tagQuery
void connectTag
void relatedArticleQuery
