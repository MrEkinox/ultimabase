import { ChevronDown } from 'lucide-react'

import { currentDocumentationPath } from '../../lib/docs-versions'
import { Section, TextLink } from '../primitives'

/** Answers follow the overview, runtime, schema typing, and release-status contracts. */
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
		question: 'Do I need a code generation step?',
		answer:
			'No. Your schemas and installed plugins define the application at runtime, and TypeScript infers precise fields and query results from the same declarations. There is no generated client or declaration file.',
		href: 'core/data-modeling/schemas',
		label: 'How schemas are typed',
	},
	{
		question: 'How are database schema changes handled?',
		answer:
			'The PostgreSQL plugin offers three policies: override applies supported schema changes, fail checks for drift, and ignore leaves preparation to your own process. Review changes before applying them. No official migration runner is shipped yet.',
		href: 'plugins/official/postgresql',
		label: 'Compare schema policies',
	},
	{
		question: 'What do I manage when I deploy?',
		answer:
			'You own hosting, database backups, secrets, monitoring, and the controls around your public endpoints. UltimaBase supplies application APIs and optional policy plugins; it does not provide a hosted console or a built-in job or cache service.',
		href: 'operations/before-exposing-your-application',
		label: 'Before exposing your application',
	},
	{
		question: 'What does pre-release mean?',
		answer:
			'You can evaluate the implementation today using the runnable source example; packages are not published on npm yet. Public APIs can change before a stable release. The documentation’s 1.0.0 label is not a stability guarantee, and no production support window has been announced.',
		href: 'project/release-status',
		label: 'Read the current status',
	},
] as const

export function LandingFaq() {
	return (
		<Section className="ub-faq" aria-labelledby="faq-title">
			<h2 id="faq-title">A few things to know.</h2>
			<div className="ub-faq-list">
				{questions.map((item, index) => (
					<details key={item.question} open={index === 0}>
						<summary>
							{item.question}
							<ChevronDown aria-hidden="true" />
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
