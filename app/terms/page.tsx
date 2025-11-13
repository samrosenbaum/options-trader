import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#05070E] text-white">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white"
          >
            <span>←</span>
            Back to home
          </Link>
        </div>

        <h1 className="mb-8 text-4xl font-display font-bold text-white">
          Terms of Service & Legal Disclosures
        </h1>

        <div className="space-y-8 text-white/70">
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-white">
              Important Legal Disclosure
            </h2>
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8">
              <div className="space-y-4 text-sm leading-relaxed">
                <div>
                  <h3 className="mb-2 font-semibold text-red-400">NOT FINANCIAL ADVICE</h3>
                  <p>
                    Monty is a software tool for educational and informational purposes only. Nothing on this platform constitutes financial, investment, trading, or other professional advice. All content, analysis, and recommendations are provided for informational purposes only and should not be construed as a recommendation to buy or sell any security.
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold text-red-400">RISK OF LOSS</h3>
                  <p>
                    Options trading involves substantial risk of loss and is not suitable for all investors. You could lose all of your invested capital. Past performance is not indicative of future results. The risk of loss in trading options can be substantial and may exceed your initial investment.
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold text-red-400">NOT REGISTERED INVESTMENT ADVICE</h3>
                  <p>
                    Monty Quantitative Labs is not a registered investment advisor, broker-dealer, or financial institution. We do not provide personalized investment advice or recommendations. Users are solely responsible for their own investment decisions and should consult with a licensed financial advisor before making any investment.
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold text-red-400">NO WARRANTIES</h3>
                  <p>
                    The platform and all data, analysis, and tools are provided &quot;as is&quot; without warranties of any kind, either express or implied. We make no guarantees regarding the accuracy, completeness, or timeliness of any information provided.
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold text-red-400">LIMITATION OF LIABILITY</h3>
                  <p>
                    By using Monty, you agree that Monty Quantitative Labs and its affiliates shall not be liable for any losses or damages arising from your use of the platform or reliance on any information provided. You assume full responsibility for all trading decisions and their outcomes.
                  </p>
                </div>

                <div className="border-t border-red-500/20 pt-4">
                  <p className="italic text-white/50">
                    By accessing this platform, you acknowledge that you have read, understood, and agreed to these terms and assume all risks associated with options trading.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-white">Terms of Service</h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <div>
                <h3 className="mb-2 font-semibold text-white/90">1. Acceptance of Terms</h3>
                <p>
                  By accessing and using Monty, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to these terms, you should not use this platform.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-white/90">2. Use License</h3>
                <p>
                  Permission is granted to temporarily access and use Monty for personal, non-commercial purposes. This is the grant of a license, not a transfer of title, and under this license you may not: modify or copy the materials; use the materials for any commercial purpose; attempt to decompile or reverse engineer any software contained on Monty; remove any copyright or other proprietary notations from the materials; or transfer the materials to another person.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-white/90">3. User Responsibilities</h3>
                <p>
                  You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account. You agree not to use the platform for any unlawful purpose or in any way that could damage, disable, or impair the platform.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-white/90">4. Data and Privacy</h3>
                <p>
                  We collect and process data in accordance with our privacy practices. By using Monty, you consent to such processing and you warrant that all data provided by you is accurate. We do not sell your personal information to third parties.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-white/90">5. Modifications to Service</h3>
                <p>
                  Monty Quantitative Labs reserves the right to modify or discontinue the service at any time without notice. We shall not be liable to you or any third party for any modification, suspension, or discontinuance of the service.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-white/90">6. Governing Law</h3>
                <p>
                  These terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-white">Contact</h2>
            <p className="text-sm">
              If you have any questions about these Terms, please contact us through the platform.
            </p>
          </section>

          <div className="border-t border-white/10 pt-8 text-center text-xs text-white/50">
            <p>Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <p className="mt-2">© {new Date().getFullYear()} Monty Quantitative Labs. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
