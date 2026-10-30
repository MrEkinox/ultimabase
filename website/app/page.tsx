// The landing page (D-155): the product sentence and one example, then each
// capability with the example code that shows it, questions and the start.
import { HomeLayout } from 'fumadocs-ui/layouts/home'

import { Questions, Start } from '../components/landing/closing'
import { Hero } from '../components/landing/hero'
import { Beyond, Data, Transactions } from '../components/landing/more'
import { Plugins, Statement, Users } from '../components/landing/sections'
import { shared } from '../lib/layout'

export default function Landing() {
	return (
		<HomeLayout {...shared}>
			<div className="ub-landing">
				<Hero />
				<Statement />
				<Plugins />
				<Users />
				<Data />
				<Transactions />
				<Beyond />
				<Questions />
				<Start />
			</div>
		</HomeLayout>
	)
}
