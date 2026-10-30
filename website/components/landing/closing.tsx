// The questions a developer asks first, and the invitation to start.
import { Command } from '../command'
import { command } from './hero'
import { Button, Question, To, docs } from './parts'

export function Questions() {
	return (
		<section className="ub-section ub-narrow">
			<h2>A few things to know.</h2>
			<div className="ub-questions">
				<Question title="How does it compare to Parse or Supabase?">
					Like Parse Server, it is a backend you run yourself, with models,
					access rules, hooks and functions. Unlike Supabase's policies, written
					in SQL, its rules are TypeScript beside each model, and apply to your
					server code too. Everything is typed from the models, with no
					generated code.
				</Question>
				<Question title="Can I use it in production?">
					Not yet. UltimaBase is pre-release, and its API may still change
					before 0.1.
				</Question>
				<Question title="Is UltimaBase a hosted service?">
					No. It is a library and a command line: the application is yours, and
					runs wherever Node.js runs, on your own PostgreSQL. See{' '}
					<To href={docs('deploy')}>Deploy</To>.
				</Question>
				<Question title="Do I generate code?">
					No. The types come from the models: queries, rules and hooks are typed
					as you write them, and the GraphQL schema and the OpenAPI document are
					built when the application starts.
				</Question>
				<Question title="How does the database change with the models?">
					In development, <code>ultimabase dev</code> syncs the tables to the
					models at each start. In production,{' '}
					<code>ultimabase migrate create</code> writes a migration file you
					review and commit, and <code>ultimabase migrate deploy</code> applies
					it. See <To href={docs('postgres')}>PostgreSQL</To>.
				</Question>
				<Question title="Which databases does it support?">
					PostgreSQL, and <code>memory()</code> for a first application and the
					tests. Another database takes an adapter, checked by the contract
					suite: see <To href={docs('adapters')}>Write a database adapter</To>.
				</Question>
				<Question title="Can it run on several instances?">
					Sessions are rows in the database, and with PostgreSQL the realtime
					plugin hears changes through <code>pg_notify</code>. Running several
					instances behind a load balancer is not documented yet.
				</Question>
				<Question title="What is not there yet?">
					An admin interface, sign-in with OAuth or a magic link, background
					jobs and multi-tenancy: they come after 0.1. Sign-in today is an email
					and a password, and a plugin can add other callers, such as an API
					key: see <To href={docs('plugins')}>Write a plugin</To>.
				</Question>
			</div>
		</section>
	)
}

export function Start() {
	return (
		<section className="ub-start">
			<p className="ub-label">Start</p>
			<h2>Build your first backend.</h2>
			<p className="ub-intro">
				One command writes an application with a model, its tests and a GraphQL
				API. The quickstart takes it from there.
			</p>
			<div className="ub-actions">
				<Command>{command}</Command>
				<Button href={docs('quickstart')}>Follow the quickstart</Button>
			</div>
			<p className="ub-note">
				<span aria-hidden="true" className="ub-dot" />
				Apache-2.0 · Pre-release
			</p>
		</section>
	)
}
