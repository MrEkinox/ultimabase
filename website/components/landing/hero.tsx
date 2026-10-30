// The hero: the product sentence, what an application is made of, and one
// example followed from its model to a client's reads and writes.
import { Command } from '../command'
import { Example } from '../example'
import { Mark } from '../logo'
import { Button, Proof, Result, Row, Rows } from './parts'

export const command = 'npm create ultimabase@latest'

/** Your models and your plugins make the backend. */
function Equation() {
	return (
		<aside aria-label="What an application is made of" className="ub-equation">
			<p className="ub-label">Your application</p>
			<div className="ub-term">
				<p className="ub-term-name">Your models</p>
				<ul className="ub-chips">
					<li>Post</li>
					<li>Author</li>
					<li>Comment</li>
					<li className="ub-chip-more">…</li>
				</ul>
			</div>
			<p aria-hidden="true" className="ub-plus">
				+
			</p>
			<div className="ub-term">
				<p className="ub-term-name">Your plugins</p>
				<ul className="ub-chips">
					<li>graphql</li>
					<li>rest</li>
					<li>postgres</li>
					<li>password</li>
					<li>realtime</li>
					<li className="ub-chip-own">+ your own</li>
				</ul>
			</div>
			<p aria-hidden="true" className="ub-equals" />
			<div className="ub-term ub-term-result">
				<Mark className="ub-turning" />
				<div>
					<p className="ub-term-name">A working backend</p>
					<p className="ub-term-text">
						Typed, served, and guarded by its rules.
					</p>
				</div>
			</div>
		</aside>
	)
}

export function Hero() {
	return (
		<header className="ub-hero">
			<div className="ub-hero-copy">
				<p className="ub-kicker">
					For TypeScript teams who want a backend they own
				</p>
				<h1>
					Your data model. <em>A working backend.</em>
				</h1>
				<p className="ub-lede">
					One access rule per model, enforced over GraphQL, REST and your server
					code. Fully typed, no codegen, on your own PostgreSQL, and every
					capability is a plugin you choose.
				</p>
				<div className="ub-actions">
					<Command>{command}</Command>
					<Button href="/docs">Read the docs</Button>
					<Button href="https://github.com/MrEkinox/ultimabase" quiet>
						GitHub
					</Button>
				</div>
				<p className="ub-note">
					<span aria-hidden="true" className="ub-dot" />
					Open source · Pre-release, not for production yet · Node.js 24.7+
				</p>
			</div>
			<Equation />
			<Proof
				panes={[
					{
						name: 'The model',
						code: <Example file="introduction/src/models.ts" region="post" />,
						result: (
							<Result eyebrow="Model → types" title="Post">
								<Rows>
									<Row name="title" value="string">
										Required
									</Row>
									<Row name="published" value="boolean">
										false unless set
									</Row>
									<Row name="read" value="where({ published: true })">
										Every client read joins this filter
									</Row>
								</Rows>
							</Result>
						),
					},
					{
						name: 'GraphQL',
						code: <Example file="introduction/src/app.test.ts" region="read" />,
						result: (
							<Result eyebrow="What a client reads" title="One post of two">
								<Rows>
									<Row name="Hello" value="published: true">
										Served
									</Row>
									<Row name="Draft" off value="published: false">
										Left out by the rule
									</Row>
								</Rows>
							</Result>
						),
					},
					{
						name: 'REST',
						code: <Example file="introduction/src/app.test.ts" region="rest" />,
						result: (
							<Result eyebrow="GET /api/posts" title="The same post">
								<Rows>
									<Row name="Hello" value="published: true">
										Served
									</Row>
									<Row name="Draft" off value="published: false">
										Left out by the same rule
									</Row>
								</Rows>
							</Result>
						),
					},
					{
						name: 'Server code',
						code: (
							<Example file="introduction/src/app.test.ts" region="server" />
						),
						result: (
							<Result eyebrow="Post.findMany" title="Typed from the model">
								<Rows>
									<Row name="found" value="[{ title: 'Hello' }]">
										The rule applies here too
									</Row>
									<Row name="type" value="{ readonly title: string }[]">
										Nothing generated
									</Row>
								</Rows>
							</Result>
						),
					},
					{
						name: 'A write',
						code: (
							<Example file="introduction/src/app.test.ts" region="write" />
						),
						result: (
							<Result eyebrow="What a client writes" title="Nothing">
								<Rows>
									<Row name="createPost" off value="ACCESS_DENIED">
										No rule opens it: only server code writes
									</Row>
								</Rows>
							</Result>
						),
					},
				]}
			>
				One model, one rule, every way in: the code of{' '}
				<code>examples/introduction</code>, run by its tests.{' '}
				<a href="#plugins">See the application ↓</a>
			</Proof>
		</header>
	)
}
