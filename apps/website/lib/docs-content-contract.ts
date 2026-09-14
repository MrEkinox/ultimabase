import { pageSchema } from 'fumadocs-core/source/schema'
import { z } from 'zod'

export const documentationAudiences = [
	'application-developer',
	'plugin-author',
	'operator',
] as const

export const documentationContentTypes = [
	'tutorial',
	'guide',
	'concept',
	'troubleshooting',
	'reference',
] as const

export const documentationReleaseStatuses = ['pre-release', 'stable'] as const
export const documentationSourceStatuses = [
	'ready',
	'partial',
	'missing',
] as const

export const translationSchema = z.object({
	reviewedAt: z.iso.date(),
	source: z.string().startsWith('/docs'),
})

export const documentationMetadataFields = {
	audience: z.array(z.enum(documentationAudiences)).min(1),
	contentType: z.enum(documentationContentTypes),
	description: z.string().trim().min(1),
	order: z.number().int().nonnegative().optional(),
	outcome: z.string().trim().min(1),
	owner: z.string().regex(/^\d{4}$/u),
	releaseStatus: z.enum(documentationReleaseStatuses),
	sources: z.array(z.string().trim().min(1)).min(1),
	translation: translationSchema.optional(),
}

export const documentationPageSchema = pageSchema.extend(
	documentationMetadataFields,
)

const plannedPageSchema = z.object({
	contentType: z.enum(documentationContentTypes),
	outcome: z.string().trim().min(1),
	slug: z.string().trim().min(1),
})

const plannedSectionSchema = z.object({
	audiences: z.array(z.enum(documentationAudiences)).min(1),
	label: z.string().trim().min(1),
	owner: z.string().regex(/^\d{4}$/u),
	pages: z.array(plannedPageSchema).min(1),
	releaseStatus: z.enum(documentationReleaseStatuses),
	slug: z.string().trim().min(1),
	sources: z.array(z.string().trim().min(1)).min(1),
	sourceStatus: z.enum(documentationSourceStatuses),
})

const standalonePageSchema = plannedPageSchema.extend({
	audiences: z.array(z.enum(documentationAudiences)).min(1),
	owner: z.string().regex(/^\d{4}$/u),
	path: z.string().startsWith('/'),
	releaseStatus: z.enum(documentationReleaseStatuses),
	sources: z.array(z.string().trim().min(1)).min(1),
	sourceStatus: z.enum(documentationSourceStatuses),
})

export const documentationPlanSchema = z.object({
	sections: z.array(plannedSectionSchema),
	standalonePages: z.array(standalonePageSchema),
})

export type DocumentationContentType =
	(typeof documentationContentTypes)[number]

export interface EditorialTemplate {
	readonly purpose: string
	readonly requiredSections: readonly string[]
}

export const editorialTemplates: Readonly<
	Record<DocumentationContentType, EditorialTemplate>
> = Object.freeze({
	concept: {
		purpose:
			'Explain why a framework idea exists and how its boundaries relate.',
		requiredSections: [
			'Context',
			'Mental model',
			'Boundaries',
			'Related tasks',
		],
	},
	guide: {
		purpose: 'Help an informed reader complete one bounded task.',
		requiredSections: [
			'Outcome',
			'Prerequisites',
			'Steps',
			'Verify',
			'Next steps',
		],
	},
	reference: {
		purpose: 'Provide precise lookup information for a stable public contract.',
		requiredSections: [
			'Signature',
			'Parameters',
			'Returns',
			'Errors',
			'Example',
		],
	},
	troubleshooting: {
		purpose:
			'Move from an observable symptom to a safe diagnosis and recovery.',
		requiredSections: ['Symptom', 'Cause', 'Confirm', 'Resolve', 'Escalate'],
	},
	tutorial: {
		purpose: 'Teach a complete beginner journey with a working result.',
		requiredSections: [
			'What you will build',
			'Prerequisites',
			'Steps',
			'Expected result',
			'Next steps',
		],
	},
})
