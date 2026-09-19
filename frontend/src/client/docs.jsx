import React, { useEffect } from 'react'
import SharedHeader from './components/SharedHeader'
import './styles/index.css'

const TOC = [
  { id: 'overview', label: 'What is HackPay' },
  { id: 'escrow', label: 'What is escrow' },
  { id: 'flow', label: 'How a payout works' },
  { id: 'roles', label: 'Roles' },
  { id: 'razorpay', label: 'Razorpay' },
  { id: 'aws', label: 'AWS' },
  { id: 'agent', label: 'Agent & AI' },
  { id: 'limits', label: 'Limits' },
]

function FlowArrow() {
  return (
    <span className="pv-flowdiag__arrow" aria-hidden>
      →
    </span>
  )
}

function FlowNode({ children, tone = 'default' }) {
  return <span className={`pv-flowdiag__node pv-flowdiag__node--${tone}`}>{children}</span>
}

export default function DocsPage() {
  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.slice(1)
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [])

  return (
    <div className="pv-shell">
      <a className="pv-skip-link" href="#main">
        Skip to content
      </a>

      <SharedHeader
        activeTab="docs"
        subtitle="Docs"
        navLinks={[
          { label: 'Home', href: '/' },
          { label: 'Past events', href: '/past-events' },
        ]}
      />

      <main id="main" className="pv-docs">
        <div className="pv-container pv-docs__layout">
          <aside className="pv-docs__toc" aria-label="On this page">
            <p className="pv-docs__toc-label">On this page</p>
            <nav>
              <ul>
                {TOC.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="pv-docs__body">
            <header className="pv-docs__hero">
              <h1 className="pv-docs__title">HackPay docs</h1>
              <p className="pv-docs__lede">
                Dual-control INR prize escrow for hackathons. Sponsors lock money, organizers
                run the event, winners get paid only after both sides agree — backed by Razorpay
                and AWS.
              </p>
            </header>

            <section id="overview" className="pv-docs__section">
              <h2>What is HackPay</h2>
              <p>
                HackPay is a web app for college and community hackathons where prize money is
                easy to argue about and hard to reverse. Instead of trusting a spreadsheet or a
                single organizer wallet, HackPay holds the prize pool in a dual-control vault
                until the sponsor and organizer both approve the winner list.
              </p>
              <p>
                Money is denominated in <strong>INR</strong>. Settlement uses{' '}
                <strong>Razorpay</strong> (Checkout for funding, RazorpayX when available for
                payouts). Application state, auth, receipts, and orchestration run on{' '}
                <strong>AWS</strong>.
              </p>
              <figure className="pv-flowdiag" aria-label="HackPay at a glance">
                <figcaption className="pv-flowdiag__caption">At a glance</figcaption>
                <div className="pv-flowdiag__row">
                  <FlowNode tone="sponsor">Sponsor funds</FlowNode>
                  <FlowArrow />
                  <FlowNode tone="vault">INR escrow</FlowNode>
                  <FlowArrow />
                  <FlowNode tone="dual">2-of-2 approve</FlowNode>
                  <FlowArrow />
                  <FlowNode tone="winner">Winner payout</FlowNode>
                </div>
              </figure>
            </section>

            <section id="escrow" className="pv-docs__section">
              <h2>What is escrow here</h2>
              <p>
                Escrow means the prize pool is locked before judging finishes, and{' '}
                <strong>neither side can move it alone</strong>:
              </p>
              <ul>
                <li>
                  The <strong>sponsor</strong> cannot claw funds back after locking without the
                  organizer’s path through the product.
                </li>
                <li>
                  The <strong>organizer</strong> cannot divert or release payouts without sponsor
                  co-approval.
                </li>
                <li>
                  <strong>Winners</strong> only receive money after propose → approve → execute
                  (and payment/git gates pass).
                </li>
              </ul>
              <figure className="pv-flowdiag" aria-label="Dual-control escrow diagram">
                <figcaption className="pv-flowdiag__caption">Dual control</figcaption>
                <div className="pv-flowdiag__split">
                  <div className="pv-flowdiag__col">
                    <FlowNode tone="sponsor">Sponsor</FlowNode>
                    <span className="pv-flowdiag__hint">funds + co-approves</span>
                  </div>
                  <div className="pv-flowdiag__merge">
                    <div className="pv-flowdiag__merge-lines" aria-hidden />
                    <FlowNode tone="vault">Escrow vault</FlowNode>
                    <span className="pv-flowdiag__hint">locked until both say yes</span>
                  </div>
                  <div className="pv-flowdiag__col">
                    <FlowNode tone="organizer">Organizer</FlowNode>
                    <span className="pv-flowdiag__hint">proposes + executes</span>
                  </div>
                </div>
                <div className="pv-flowdiag__row pv-flowdiag__row--center">
                  <FlowArrow />
                  <FlowNode tone="winner">Winners (UPI / bank)</FlowNode>
                </div>
              </figure>
              <p>
                This is application-level dual control over an INR vault, not a blockchain
                multisig. Receipts are Razorpay ids (or queued placeholders) plus audit JSON
                stored on S3 / CloudFront.
              </p>
            </section>

            <section id="flow" className="pv-docs__section">
              <h2>How a payout works</h2>
              <figure className="pv-flowdiag" aria-label="Payout lifecycle flowchart">
                <figcaption className="pv-flowdiag__caption">Lifecycle</figcaption>
                <ol className="pv-flowdiag__steps">
                  <li>
                    <span className="pv-flowdiag__step-num">1</span>
                    <span>
                      <strong>Create</strong>
                      <br />
                      Organizer sets event + pool
                    </span>
                  </li>
                  <li>
                    <span className="pv-flowdiag__step-num">2</span>
                    <span>
                      <strong>Fund</strong>
                      <br />
                      Sponsor Checkout (or mock)
                    </span>
                  </li>
                  <li>
                    <span className="pv-flowdiag__step-num">3</span>
                    <span>
                      <strong>Judge</strong>
                      <br />
                      Select winners (± AI advice)
                    </span>
                  </li>
                  <li>
                    <span className="pv-flowdiag__step-num">4</span>
                    <span>
                      <strong>Propose</strong>
                      <br />
                      Organizer posts split
                    </span>
                  </li>
                  <li>
                    <span className="pv-flowdiag__step-num">5</span>
                    <span>
                      <strong>Approve</strong>
                      <br />
                      Sponsor co-signs
                    </span>
                  </li>
                  <li>
                    <span className="pv-flowdiag__step-num">6</span>
                    <span>
                      <strong>Execute</strong>
                      <br />
                      Gates → RazorpayX / queued
                    </span>
                  </li>
                </ol>
              </figure>
              <ol className="pv-docs__steps">
                <li>
                  <strong>Create event</strong> — Organizer sets the hackathon and prize pool.
                </li>
                <li>
                  <strong>Fund</strong> — Sponsor pays into escrow via Razorpay Checkout (or a
                  mock order when keys are absent).
                </li>
                <li>
                  <strong>Register &amp; judge</strong> — Participants register; organizer selects
                  winners (optional AI shortlist is advisory only).
                </li>
                <li>
                  <strong>Propose</strong> — Organizer proposes the payout split.
                </li>
                <li>
                  <strong>Approve</strong> — Sponsor co-approves the same proposal.
                </li>
                <li>
                  <strong>Execute</strong> — Agent / execute path runs payment and git gates, then
                  attempts RazorpayX payouts (or records <code>pout_queued_…</code> if X is not
                  configured).
                </li>
              </ol>
            </section>

            <section id="roles" className="pv-docs__section">
              <h2>Roles</h2>
              <figure className="pv-flowdiag" aria-label="Role portals">
                <figcaption className="pv-flowdiag__caption">Three consoles, one vault</figcaption>
                <div className="pv-flowdiag__row">
                  <FlowNode tone="sponsor">Sponsor → /verifier</FlowNode>
                  <FlowNode tone="organizer">Organizer → /organizer</FlowNode>
                  <FlowNode tone="winner">Participant → /holder</FlowNode>
                </div>
              </figure>
              <div className="pv-docs__role-grid">
                <div>
                  <h3>Sponsor</h3>
                  <p>
                    Funds the pool, reviews winners, co-approves release.{' '}
                    <a href="/verifier">Open sponsor console</a>
                  </p>
                </div>
                <div>
                  <h3>Organizer</h3>
                  <p>
                    Creates events, manages participants, proposes and executes payouts.{' '}
                    <a href="/organizer">Open organizer console</a>
                  </p>
                </div>
                <div>
                  <h3>Participant</h3>
                  <p>
                    Registers, adds a UPI / bank destination, tracks payout status.{' '}
                    <a href="/holder">Open participant portal</a>
                  </p>
                </div>
              </div>
              <p>
                Sign-in is <strong>Amazon Cognito</strong> with a role claim (
                <code>organizer</code> / <code>sponsor</code> / <code>participant</code>).
              </p>
            </section>

            <section id="razorpay" className="pv-docs__section">
              <h2>How Razorpay is used</h2>
              <p>
                Razorpay is the <strong>money rail</strong>. AWS never replaces the bank path.
              </p>
              <figure className="pv-flowdiag" aria-label="Razorpay money flow">
                <figcaption className="pv-flowdiag__caption">Money path</figcaption>
                <div className="pv-flowdiag__stack">
                  <div className="pv-flowdiag__row">
                    <FlowNode tone="sponsor">Sponsor</FlowNode>
                    <FlowArrow />
                    <FlowNode tone="rail">Checkout</FlowNode>
                    <FlowArrow />
                    <FlowNode tone="vault">Escrow funded</FlowNode>
                  </div>
                  <div className="pv-flowdiag__row">
                    <FlowNode tone="dual">Both approved</FlowNode>
                    <FlowArrow />
                    <FlowNode tone="rail">RazorpayX</FlowNode>
                    <FlowArrow />
                    <FlowNode tone="winner">UPI / IMPS</FlowNode>
                  </div>
                  <p className="pv-flowdiag__note">
                    No RazorpayX → <code>pout_queued_…</code> (queued, not bank credit). No API
                    keys → mock <code>order_mock_…</code> for demos.
                  </p>
                </div>
              </figure>
              <ul>
                <li>
                  <strong>Funding</strong> — Sponsor Checkout creates an order (
                  <code>order_…</code> / <code>pay_…</code>). Without API keys, HackPay uses mock
                  orders so demos still run.
                </li>
                <li>
                  <strong>Payouts</strong> — After dual approval, execute tries RazorpayX to UPI
                  or bank. Without RazorpayX / Current Account, the app records{' '}
                  <code>pout_queued_…</code> — queued, not a bank credit.
                </li>
                <li>
                  <strong>Keys</strong> — Set <code>RAZORPAY_KEY_ID</code> and{' '}
                  <code>RAZORPAY_KEY_SECRET</code> (Amplify or <code>.env</code>). Optionally store
                  the same JSON in Secrets Manager; env values still win if both are set.
                </li>
              </ul>
            </section>

            <section id="aws" className="pv-docs__section">
              <h2>How AWS is used</h2>
              <p>
                AWS is the <strong>control plane</strong>: identity, data, hosting, receipts,
                alerts, and orchestration. Region is typically <code>ap-south-1</code>.
              </p>
              <figure className="pv-flowdiag" aria-label="AWS architecture diagram">
                <figcaption className="pv-flowdiag__caption">Control plane</figcaption>
                <div className="pv-flowdiag__arch">
                  <div className="pv-flowdiag__arch-row">
                    <FlowNode tone="aws">Cognito</FlowNode>
                    <FlowArrow />
                    <FlowNode tone="aws">Amplify</FlowNode>
                    <FlowArrow />
                    <FlowNode tone="aws">DynamoDB</FlowNode>
                  </div>
                  <div className="pv-flowdiag__arch-row">
                    <FlowNode tone="aws">Bedrock / Strands</FlowNode>
                    <FlowNode tone="aws">S3 + CloudFront</FlowNode>
                    <FlowNode tone="aws">SNS</FlowNode>
                  </div>
                  <div className="pv-flowdiag__arch-row">
                    <FlowNode tone="aws">EventBridge</FlowNode>
                    <FlowArrow />
                    <FlowNode tone="aws">Lambda tick</FlowNode>
                    <FlowArrow />
                    <FlowNode tone="rail">Razorpay (INR)</FlowNode>
                  </div>
                  <p className="pv-flowdiag__note">
                    AWS decides <em>who</em> and <em>when</em>; Razorpay moves the rupees.
                  </p>
                </div>
              </figure>
              <div className="pv-docs__table-wrap">
                <table className="pv-docs__table">
                  <thead>
                    <tr>
                      <th scope="col">Service</th>
                      <th scope="col">Role in HackPay</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Amplify Hosting</td>
                      <td>Next.js SSR app judges and organizers use</td>
                    </tr>
                    <tr>
                      <td>Cognito</td>
                      <td>Email/password auth and role-based portals</td>
                    </tr>
                    <tr>
                      <td>DynamoDB</td>
                      <td>Events, participants, winners, proposals, agent state</td>
                    </tr>
                    <tr>
                      <td>S3 + CloudFront</td>
                      <td>Immutable audit / receipt JSON after release</td>
                    </tr>
                    <tr>
                      <td>SNS</td>
                      <td>Agent alert emails (subscribe from the organizer dashboard)</td>
                    </tr>
                    <tr>
                      <td>EventBridge + Lambda</td>
                      <td>Hourly tick calling the orchestration agent</td>
                    </tr>
                    <tr>
                      <td>Bedrock + Strands</td>
                      <td>Advisory winner shortlist and notices — never moves money</td>
                    </tr>
                    <tr>
                      <td>Secrets Manager</td>
                      <td>Agent cron secret; optional Razorpay key JSON</td>
                    </tr>
                    <tr>
                      <td>CloudWatch</td>
                      <td>Lambda logs and error alarm → SNS</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section id="agent" className="pv-docs__section">
              <h2>Agent &amp; AI</h2>
              <figure className="pv-flowdiag" aria-label="Agent versus humans">
                <figcaption className="pv-flowdiag__caption">Who can move money</figcaption>
                <div className="pv-flowdiag__split">
                  <div className="pv-flowdiag__col">
                    <FlowNode tone="agent">Agent / Strands</FlowNode>
                    <span className="pv-flowdiag__hint">advise · nudge · alert · gate-check</span>
                    <span className="pv-flowdiag__badge">Cannot approve</span>
                  </div>
                  <div className="pv-flowdiag__col">
                    <FlowNode tone="dual">Humans (2-of-2)</FlowNode>
                    <span className="pv-flowdiag__hint">propose · approve · execute</span>
                    <span className="pv-flowdiag__badge pv-flowdiag__badge--ok">Required</span>
                  </div>
                </div>
              </figure>
              <p>
                The <strong>orchestration agent</strong> watches funding, winners, dual approval,
                then payment/git gates. It can nudge consoles and publish SNS alerts. It{' '}
                <strong>cannot</strong> approve payouts for humans.
              </p>
              <p>
                <strong>Strands + Bedrock</strong> can suggest a ranked shortlist with scores and
                rationale. Organizers still confirm winners in the UI. Treat AI output as advice,
                not a payout instruction.
              </p>
              <p>
                On the organizer dashboard, the <strong>Agent orchestration log</strong> is
                background automation — not the same as the <strong>Event Timeline</strong>{' '}
                (hackathon schedule).
              </p>
            </section>

            <section id="limits" className="pv-docs__section">
              <h2>Limits</h2>
              <ul>
                <li>
                  If either sponsor or organizer refuses to sign, funds stay locked — there is no
                  automatic timeout / refund path yet.
                </li>
                <li>Only INR prize pools; gift cards and swag are out of scope.</li>
                <li>
                  <code>pout_queued_…</code> means payout is queued without RazorpayX — winners
                  have not received bank INR yet.
                </li>
              </ul>
              <p className="pv-docs__cta-row">
                <a href="/" className="pv-btn pv-btn--secondary">
                  Back to home
                </a>
                <a href="/organizer" className="pv-btn pv-btn--primary">
                  Create an event
                </a>
              </p>
            </section>
          </article>
        </div>
      </main>

      <footer className="pv-footer">
        <div className="pv-footer__inner">
          <span>HackPay · hackathon prize escrow powered by Razorpay INR and agentic dual-control.</span>
          <ul className="pv-footer__links">
            <li>
              <a href="/docs">Docs</a>
            </li>
            <li>
              <a href="/past-events">Past events</a>
            </li>
            <li>
              <a href="/holder">Participant</a>
            </li>
            <li>
              <a href="/organizer">Organizer</a>
            </li>
            <li>
              <a href="/verifier">Sponsor</a>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  )
}
