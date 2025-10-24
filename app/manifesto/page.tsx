import Link from 'next/link'
import Image from 'next/image'

const manifestoPoints = [
  {
    title: 'Scan thousands of options contracts',
    description:
      'Monty sifts through the noise of every chain, surfacing only the contracts that meet strict flow, volatility, and momentum criteria—so only the best ideas reach your desk.',
  },
  {
    title: 'Chat with your personal trade analyst',
    description:
      "Think of a quant as a data-obsessed strategist. Monty translates their models into plain language, so you can pressure-test any setup without needing Wall Street jargon.",
  },
  {
    title: 'Sell or hold signals for confident exits',
    description:
      'Our signals monitor gamma shifts, liquidity, and sentiment to tell you exactly when it is time to secure profits or let the position ride.',
  },
  {
    title: 'Track your misses, learn from your losses',
    description:
      'The Anti-Portfolio records every rejection and outcome, helping you iterate like a pro desk and sharpen your edge over time.',
  },
]

const uprisingTimeline = [
  {
    era: 'Bucket shop rebels',
    story:
      'Retail traders hustled their way out of smoky backrooms by mastering tape reading and discipline, proving the house could be beaten with focus and data.',
  },
  {
    era: 'Garage quants of the 80s',
    story:
      'Outside the big banks, small teams built models on personal computers and forced Wall Street to recognize the power of independent analytics.',
  },
  {
    era: 'The online trading uprising',
    story:
      'Forums and chat rooms gave everyday traders a seat at the table. Today, AI puts institutional-grade insights directly into your workflow.',
  },
]

export default function ManifestoPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-slate-100">
      <header className="border-b border-white/10 bg-black/50 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <Link href="/" className="text-xs font-semibold uppercase tracking-[0.35em] text-white/60 hover:text-white">
            Monty
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-white/70 sm:flex">
            <Link href="/" className="transition hover:text-white">
              Platform
            </Link>
            <Link href="/manifesto" className="text-white">
              Manifesto
            </Link>
            <Link href="/auth/login" className="transition hover:text-white">
              Sign In
            </Link>
          </nav>
          <Link
            href="/auth/login"
            className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.35em] text-white/80 transition hover:border-white/60 hover:text-white"
          >
            Join
          </Link>
        </div>
      </header>

      <main>
        <section className="relative border-b border-white/10">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(18,122,255,0.15),transparent_55%)]" />
            <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle,_rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:12px_12px]" />
          </div>
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 border-x border-white/10 bg-black/40 text-white md:grid-cols-[1.35fr_1fr]">
            <div className="flex flex-col justify-between border-b border-white/10 p-10 md:border-b-0 md:border-r">
              <div className="flex items-center justify-between border-b border-white/10 pb-6 text-[11px] uppercase tracking-[0.4em] text-white/50">
                <span>The Monty Manifesto</span>
                <span>Edition 001</span>
              </div>
              <div className="pt-8">
                <h1 className="font-display text-5xl leading-[1.08] text-white sm:text-6xl md:text-7xl">
                  For every trader who was told the house always wins.
                </h1>
                <p className="mt-6 max-w-2xl text-lg text-white/70">
                  Derivatives were built for Wall Street, but Monty delivers a quant at your fingertips without the jargon. We translate the math into plain language so you can execute like an insider and still trade on your own terms.
                </p>
                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                  {manifestoPoints.slice(0, 2).map((point) => (
                    <div key={point.title} className="border border-white/10 bg-black/60 p-5">
                      <h3 className="font-display text-xl text-white">{point.title}</h3>
                      <p className="mt-3 text-sm text-white/70">{point.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-6 text-[10px] uppercase tracking-[0.35em] text-white/40">
                <span>Retail Resilience Bureau</span>
                <span>Since 2024</span>
              </div>
            </div>
            <div className="relative flex flex-col border-t border-white/10 md:border-t-0">
              <div className="relative flex-1 overflow-hidden border-b border-white/10">
                <div className="absolute inset-0">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.08),transparent_60%)]" />
                  <div className="absolute inset-0 opacity-[0.35] [background-image:repeating-linear-gradient(135deg,_rgba(255,255,255,0.08)_0px,_rgba(255,255,255,0.08)_1px,transparent_1px,transparent_8px)]" />
                </div>
                <Image
                  src="/trade_desk.png"
                  alt="Abstract trading desk"
                  fill
                  priority
                  className="object-cover mix-blend-lighten opacity-80"
                />
              </div>
              <div className="flex flex-col gap-6 p-8">
                {manifestoPoints.slice(2).map((point) => (
                  <div key={point.title} className="border border-white/10 bg-black/70 p-5">
                    <h3 className="font-display text-xl text-white">{point.title}</h3>
                    <p className="mt-3 text-sm text-white/70">{point.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-white/10 bg-[#0B0B0D]">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.5em] text-white/40">Lineage</p>
              <h2 className="mt-6 font-display text-4xl text-white sm:text-5xl">
                The uprising that built this desk.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70">
                Every generation of retail traders fought their way past gatekeepers. They read the tape by hand, coded models in garages, and shared edge in forums while institutions tried to shut the doors. Monty is where that rebellion becomes a platform.
              </p>
            </div>
            <div className="space-y-8 border border-white/10 bg-black/50 p-8">
              {uprisingTimeline.map((moment, index) => (
                <div key={moment.era} className="grid gap-3 sm:grid-cols-[120px_1fr] sm:gap-6">
                  <div className="text-xs uppercase tracking-[0.4em] text-white/40">0{index + 1}</div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.35em] text-white/60">{moment.era}</p>
                    <p className="mt-3 text-base text-white/70">{moment.story}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10 bg-black/40">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-20 lg:flex-row">
            <div className="flex-1 border border-white/10 bg-[#09090B] p-10">
              <p className="text-xs uppercase tracking-[0.4em] text-white/50">What Monty Delivers</p>
              <h3 className="mt-6 font-display text-4xl text-white">
                Institutional-grade edge, translated for the retail desk.
              </h3>
              <p className="mt-6 text-base leading-relaxed text-white/70">
                The same derivatives infrastructure that protected Wall Street desks now powers your playbook. We scan the market, surface the highest probability contracts, map exits, and capture every lesson. You bring conviction—we supply the quant firepower.
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-6">
              <div className="border border-white/10 bg-[#0C0C10] p-8">
                <p className="text-xs uppercase tracking-[0.45em] text-white/40">Signals</p>
                <p className="mt-3 text-lg text-white/80">
                  Sell or hold alerts built on gamma, liquidity, and sentiment so you never have to guess your exit.
                </p>
              </div>
              <div className="border border-white/10 bg-[#0C0C10] p-8">
                <p className="text-xs uppercase tracking-[0.45em] text-white/40">Research</p>
                <p className="mt-3 text-lg text-white/80">
                  Conversational analysis that lets you interrogate trades like you hired the quant desk yourself.
                </p>
              </div>
              <div className="border border-white/10 bg-[#0C0C10] p-8">
                <p className="text-xs uppercase tracking-[0.45em] text-white/40">Discipline</p>
                <p className="mt-3 text-lg text-white/80">
                  An Anti-Portfolio that captures every miss and loss so your next play is sharper.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#050505]">
          <div className="mx-auto flex max-w-4xl flex-col items-center border border-white/10 bg-black/60 px-8 py-16 text-center">
            <p className="text-xs uppercase tracking-[0.4em] text-white/40">Call to action</p>
            <h3 className="mt-6 font-display text-4xl text-white sm:text-5xl">
              Rise from the retail ranks.
            </h3>
            <p className="mt-6 text-base leading-relaxed text-white/70">
              The greats started where you are—outside the velvet rope, hungry for better data. Monty is the desk they wished they had. Bring your ambition, and we will hand you the tools to trade like the house never expected.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/auth/login"
                className="rounded-full border border-white/30 px-8 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:border-emerald-400 hover:text-emerald-300"
              >
                Build your trade desk
              </Link>
              <Link
                href="/"
                className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60 transition hover:text-white"
              >
                Return home
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-[10px] uppercase tracking-[0.35em] text-white/30 sm:flex-row">
          <span>© {new Date().getFullYear()} Monty Trading Intelligence</span>
          <span>Retail First. Always.</span>
        </div>
      </footer>
    </div>
  )
}
