import { Plus } from 'lucide-react'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { Section, TextLink } from '../primitives'

/** Answers follow the overview, runtime, Typegen, and release-status contracts. */
const questions = [
	{
		question: 'Is UltimaBase a hosted service?',
		answer:
			'UltimaBase is an open-source backend framework that runs in your Node.js application. You provide the PostgreSQL database and hosting.',
		href: '',
		label: 'What is UltimaBase',
	},
	{
		question: 'What does it provide beyond database queries?',
		answer:
			'Schemas, typed data operations, and a shared execution pipeline. Optional plugins add APIs, hooks, validation, authentication, and authorization around those operations.',
		href: 'core/runtime/runtime-pipeline',
		label: 'Explore the runtime',
	},
	{
		question: 'Does my application need Typegen to run?',
		answer:
			'No. Your schemas and installed plugins define the application at runtime. Typegen produces declarations for precise TypeScript fields and query results; it does not generate an executable client.',
		href: 'guides/generate-types',
		label: 'How Typegen works',
	},
	{
		question: 'What does pre-release mean?',
		answer:
			'You can evaluate the implementation today, but public APIs can change before a stable release. The documentation’s 1.0.0 label is not a stability guarantee, and no production support window has been announced.',
		href: 'project/release-status',
		label: 'Read the current status',
	},
] as const

export function LandingFaq() {
	return (
		<Section className="ub-faq" aria-labelledby="faq-title">
			<div>
				<p className="ub-section-index">04 / QUESTIONS</p>
				<h2 id="faq-title">Before you start.</h2>
			</div>
			<div className="ub-faq-list">
				{questions.map((item) => (
					<details key={item.question}>
						<summary>
							{item.question}
							<Plus aria-hidden="true" />
						</summary>
						<p>{item.answer}</p>
						<TextLink href={currentDocumentationPath(item.href)}>
							{item.label}
						</TextLink>
					</details>
				))}
			</div>
		</Section>
	)
}
