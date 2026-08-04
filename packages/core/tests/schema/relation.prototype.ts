import {
	relationField,
	Schema,
	stringField,
	type SchemaResult,
} from '../../src/index.js'

const PackedRelationTag = Schema.define({
	className: 'PackedRelationTag',
	fields: { label: stringField() },
})
const PackedRelationArticle = Schema.define({
	className: 'PackedRelationArticle',
	fields: {
		tags: relationField({ target: () => PackedRelationTag }),
		title: stringField(),
	},
})

declare const article: SchemaResult<typeof PackedRelationArticle>
const /* hover:relation-handle */ tags = article.relation('tags')
const /* hover:relation-query */ tagQuery = tags.query().select('id', 'label')
const connectTag = () =>
	tags./* hover:relation-connect */ connect(PackedRelationTag.pointer('tag-id'))
const relatedArticleQuery =
	PackedRelationArticle.query()./* hover:relation-predicate */ some(
		'tags',
		(tag) => tag.equalTo('label', 'typed'),
	)

void tagQuery
void connectTag
void relatedArticleQuery
