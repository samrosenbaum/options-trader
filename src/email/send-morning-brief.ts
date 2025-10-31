/**
 * Send Morning Brief via Resend
 *
 * Usage:
 * 1. Install: npm install resend
 * 2. Set env var: RESEND_API_KEY=re_...
 * 3. Call this function from cron job or API route
 */

import { Resend } from 'resend'

interface MorningBriefData {
  timestamp: string
  market_conditions: Record<string, {
    price: number
    ma20: number
    trend: 'bullish' | 'bearish'
    change_pct?: number | null
  }>
  market_regime?: {
    bias?: string
    notes?: string[]
  }
  market_snapshots?: Record<string, any>
  symbol_summaries?: Record<string, any>
  premarket_movers?: Record<string, any>
  meta?: Record<string, any>
  uoa_signals: Record<string, any>
  watchlist: string[]
  portfolio_alerts: Array<{
    symbol: string
    headline?: string
    context?: string
    actions?: string[]
    price_move?: string
    details?: string
    urgency: 'high' | 'medium' | 'low'
  }>
}

interface EmailRecipient {
  email: string
  name?: string
  user_id?: string
  dashboard_url?: string
}

export async function sendMorningBrief(
  briefData: MorningBriefData,
  recipients: EmailRecipient[]
) {
  const resend = new Resend(process.env.RESEND_API_KEY)

  const results = []

  for (const recipient of recipients) {
    try {
      const marketConditions = Object.entries(briefData.market_conditions).map(
        ([symbol, data]) => ({
          symbol,
          price: data.price.toFixed(2),
          trend: data.trend,
          change: typeof data.change_pct === 'number' ? `${data.change_pct.toFixed(2)}%` : 'n/a'
        })
      )

      const flowSummaries = Object.values(briefData.symbol_summaries || {})
        .filter((summary: any) => summary.flow_bias !== 'none' || summary.flow_status !== 'no_signal')
        .sort((a: any, b: any) => {
          if (!!a.contradiction !== !!b.contradiction) {
            return a.contradiction ? -1 : 1
          }
          return (b.flow_confidence_rank || 0) - (a.flow_confidence_rank || 0)
        })
        .slice(0, 4)
        .map((summary: any) => ({
          symbol: summary.symbol,
          bias: summary.flow_bias,
          confidence: summary.flow_confidence,
          status: summary.flow_status,
          price_move: summary.price_move,
          warnings: summary.warnings || [],
          actions: summary.action_items || [],
          flow_session: summary.flow_session,
          flow_age_hours: summary.flow_age_hours,
          earnings_label: summary.earnings_context?.label,
          contradiction: summary.contradiction,
        }))

      const moversSource = briefData.premarket_movers || briefData.market_snapshots || {}
      const moverCards = Object.values(moversSource)
        .filter((entry: any) => typeof entry.gap_pct === 'number')
        .sort((a: any, b: any) => Math.abs(b.gap_pct) - Math.abs(a.gap_pct))
        .slice(0, 5)
        .map((entry: any) => ({
          symbol: entry.symbol || entry.ticker,
          gap_pct: entry.gap_pct,
          previous_close: entry.previous_close,
          premarket_price: entry.premarket_price,
        }))

      const emailData = {
        timestamp: new Date(briefData.timestamp).toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        market_conditions: marketConditions,
        market_regime: briefData.market_regime,
        flow_summaries: flowSummaries,
        movers: moverCards,
        watchlist: briefData.watchlist.slice(0, 10), // Top 10
        portfolio_alerts: briefData.portfolio_alerts,
        conflicts: briefData.meta?.conflicts || [],
        dashboard_url: recipient.dashboard_url || 'https://yourapp.com/dashboard',
        preferences_url: 'https://yourapp.com/settings/notifications',
        unsubscribe_url: `https://yourapp.com/unsubscribe?user=${recipient.user_id}`
      }

      // Send email
      const { data, error } = await resend.emails.send({
        from: 'Monty <briefings@monty.trading>',
        to: [recipient.email],
        subject: `🌅 Morning Brief - ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
        html: renderMorningBriefHTML(emailData),
        // Also send plain text version
        text: renderMorningBriefText(emailData)
      })

      if (error) {
        console.error(`Failed to send to ${recipient.email}:`, error)
        results.push({ email: recipient.email, success: false, error })
      } else {
        console.log(`✅ Sent morning brief to ${recipient.email}`)
        results.push({ email: recipient.email, success: true, data })
      }
    } catch (error) {
      console.error(`Error sending to ${recipient.email}:`, error)
      results.push({ email: recipient.email, success: false, error })
    }
  }

  return results
}

/**
 * Render HTML email template
 */
function renderMorningBriefHTML(data: any): string {
  const marketCards = data.market_conditions
    .map((mc: any) => `
      <div style="flex: 1; background: #f1f5f9; padding: 15px; border-radius: 8px;">
        <div style="font-weight: 700; font-size: 16px; margin-bottom: 5px;">${mc.symbol}</div>
        <div style="font-size: 20px; font-weight: 600; color: #0f172a;">$${mc.price}</div>
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 5px; color: ${mc.trend === 'bullish' ? '#10b981' : '#ef4444'};">
          ${mc.trend} (${mc.change})
        </div>
      </div>
    `)
    .join('')

  const regimeNotes = (data.market_regime?.notes || [])
    .map((note: string) => `<li style="margin-bottom: 4px;">${note}</li>`)
    .join('')

  const alertsHTML = (data.portfolio_alerts || [])
    .map((alert: any) => `
      <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 12px; border-radius: 4px;">
        <div style="font-weight: 700; font-size: 16px; margin-bottom: 6px;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-right: 8px; background: ${alert.urgency === 'high' ? '#dc2626' : '#f59e0b'}; color: white;">${alert.urgency}</span>
          ${alert.symbol} — ${alert.headline || 'Position Update'}
        </div>
        ${alert.price_move ? `<div style=\"font-size: 13px; color: #475569;\"><strong>Price:</strong> ${alert.price_move}</div>` : ''}
        ${alert.context ? `<div style=\"font-size: 13px; color: #475569; margin-top: 4px;\">${alert.context}</div>` : ''}
        ${alert.details ? `<div style=\"font-size: 12px; color: #64748b; margin-top: 4px;\"><strong>Position:</strong> ${alert.details}</div>` : ''}
        ${(alert.actions || []).map((action: string) => `<div style=\"font-size: 13px; color: #0f172a; margin-top: 6px;\">→ ${action}</div>`).join('')}
      </div>
    `)
    .join('')

  const flowCards = (data.flow_summaries || [])
    .map((flow: any) => {
      const biasColor = flow.bias === 'bullish' ? '#16a34a' : flow.bias === 'bearish' ? '#dc2626' : '#475569'
      const warnings = (flow.warnings || []).map((w: string) => `<li>${w}</li>`).join('')
      const actions = (flow.actions || []).map((a: string) => `<li>${a}</li>`).join('')
      const flowMeta = flow.flow_session ? `${flow.flow_session} — ${flow.flow_age_hours?.toFixed?.(1) || flow.flow_age_hours}h old` : ''
      return `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 18px; font-weight: 700;">${flow.symbol}</div>
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: ${biasColor};">${flow.bias.toUpperCase()} • CONF ${flow.confidence?.toUpperCase?.() || 'N/A'}</div>
          </div>
          <div style="font-size: 13px; color: #475569; margin-top: 4px;">${flow.status.replace('_', ' ').toUpperCase()}</div>
          ${flowMeta ? `<div style=\"font-size: 12px; color: #64748b; margin-top: 4px;\">${flowMeta}</div>` : ''}
          ${flow.price_move ? `<div style=\"font-size: 13px; color: #0f172a; margin-top: 6px;\"><strong>Price:</strong> ${flow.price_move}</div>` : ''}
          ${warnings ? `<ul style=\"margin: 8px 0; padding-left: 18px; color: #b91c1c; font-size: 13px;\">${warnings}</ul>` : ''}
          ${actions ? `<ul style=\"margin: 8px 0; padding-left: 18px; color: #0f172a; font-size: 13px;\">${actions}</ul>` : ''}
        </div>
      `
    })
    .join('')

  const moversHTML = (data.movers || [])
    .map((mover: any) => `
      <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
        <div><strong>${mover.symbol}</strong></div>
        <div style="color: ${mover.gap_pct >= 0 ? '#16a34a' : '#dc2626'};">${mover.gap_pct.toFixed(2)}%</div>
        <div style="color: #64748b; font-size: 12px;">${mover.previous_close?.toFixed?.(2) || '-'} → ${mover.premarket_price?.toFixed?.(2) || '-'}</div>
      </div>
    `)
    .join('')

  const watchlistHTML = data.watchlist
    .map((symbol: string) => `<div style="background: #f1f5f9; padding: 10px; text-align: center; border-radius: 6px; font-weight: 600;">${symbol}</div>`)
    .join('')

  const conflictsBanner = (data.conflicts || []).length
    ? `<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 15px; margin-bottom: 20px; border-radius: 6px;">
         <strong>⚠️ Conflicts:</strong> ${data.conflicts.join(', ')} — trust price action until new flow confirms.
       </div>`
    : ''

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 700;">🌅 Morning Brief</h1>
      <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">${data.timestamp}</p>
    </div>
    <div style="padding: 20px;">
      ${conflictsBanner}
      <div style="margin-bottom: 24px; border-left: 4px solid #667eea; padding-left: 15px;">
        <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #0f172a;">📊 Market Overview</h2>
        ${data.market_regime?.bias ? `<p style=\"margin: 0 0 10px 0; color: #475569;\"><strong>Regime:</strong> ${data.market_regime.bias}</p>` : ''}
        ${regimeNotes ? `<ul style=\"margin: 0 0 12px 0; padding-left: 18px; color: #475569; font-size: 13px;\">${regimeNotes}</ul>` : ''}
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          ${marketCards}
        </div>
      </div>
      <div style="margin-bottom: 24px; border-left: 4px solid #667eea; padding-left: 15px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">⚠️ Positions to Manage</h2>
        ${alertsHTML || '<p style="color: #64748b;">No open positions flagged this morning.</p>'}
      </div>
      <div style="margin-bottom: 24px; border-left: 4px solid #667eea; padding-left: 15px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">🧭 Smart Flow Status</h2>
        ${flowCards || '<p style="color: #64748b;">No active flow signals.</p>'}
      </div>
      <div style="margin-bottom: 24px; border-left: 4px solid #667eea; padding-left: 15px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">🌄 Pre-market Movers</h2>
        ${moversHTML || '<p style="color: #64748b;">No significant gaps detected.</p>'}
      </div>
      <div style="margin-bottom: 24px; border-left: 4px solid #667eea; padding-left: 15px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">🎯 Watchlist Focus</h2>
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;">
          ${watchlistHTML}
        </div>
      </div>
      <div style="text-align: center;">
        <a href="${data.dashboard_url}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Full Dashboard →</a>
      </div>
      <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center; margin-top: 20px;">
        <strong>⏰ Next Update:</strong> Market Open (9:35 AM ET)
      </div>
    </div>
    <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 14px; color: #64748b;">
      <p>
        Generated by <strong>Monty</strong> - Your AI Options Analyst<br>
        <a href="${data.preferences_url}" style="color: #667eea; text-decoration: none;">Manage Preferences</a> &nbsp;|&nbsp;
        <a href="${data.unsubscribe_url}" style="color: #667eea; text-decoration: none;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
`
}

function renderMorningBriefText(data: any): string {
  const lines: string[] = []

  lines.push('🌅 MORNING BRIEF')
  lines.push(data.timestamp)
  lines.push('')

  if (data.market_regime?.bias || (data.market_regime?.notes || []).length) {
    lines.push('MARKET REGIME: ' + (data.market_regime.bias || 'neutral'))
    for (const note of data.market_regime.notes || []) {
      lines.push(`  • ${note}`)
    }
    lines.push('')
  }

  if (data.market_conditions?.length) {
    lines.push('INDEX CHECK:')
    for (const mc of data.market_conditions) {
      lines.push(`  ${mc.symbol}: $${mc.price} (${mc.trend} / ${mc.change})`)
    }
    lines.push('')
  }

  lines.push('POSITIONS TO MANAGE:')
  if (data.portfolio_alerts?.length) {
    for (const alert of data.portfolio_alerts) {
      lines.push(`  [${alert.urgency.toUpperCase()}] ${alert.symbol} — ${alert.headline || 'Update'}`)
      if (alert.price_move) {
        lines.push(`     Price: ${alert.price_move}`)
      }
      if (alert.context) {
        lines.push(`     Context: ${alert.context}`)
      }
      for (const action of alert.actions || []) {
        lines.push(`     → ${action}`)
      }
    }
  } else {
    lines.push('  None flagged this morning.')
  }
  lines.push('')

  if ((data.conflicts || []).length) {
    lines.push('⚠️ FLOW CONFLICTS: ' + data.conflicts.join(', '))
    lines.push("  Price action is diverging from yesterday's positioning — trust the tape until new flow arrives.")
    lines.push('')
  }

  if ((data.flow_summaries || []).length) {
    lines.push('SMART FLOW STATUS:')
    for (const flow of data.flow_summaries) {
      lines.push(`  ${flow.symbol} — ${flow.status.replace('_', ' ').toUpperCase()} | ${flow.bias.toUpperCase()} | CONF ${flow.confidence?.toUpperCase?.() || 'N/A'}`)
      if (flow.price_move) {
        lines.push(`     Price: ${flow.price_move}`)
      }
      for (const warn of flow.warnings || []) {
        lines.push(`     ⚠️ ${warn}`)
      }
      for (const action of flow.actions || []) {
        lines.push(`     → ${action}`)
      }
    }
    lines.push('')
  }

  if ((data.movers || []).length) {
    lines.push('PRE-MARKET MOVERS:')
    for (const mover of data.movers) {
      lines.push(`  ${mover.symbol}: ${mover.gap_pct.toFixed(2)}% (${(mover.previous_close ?? '-')} → ${(mover.premarket_price ?? '-')})`)
    }
    lines.push('')
  }

  if (data.watchlist?.length) {
    lines.push('WATCHLIST FOCUS:')
    lines.push('  ' + data.watchlist.join(', '))
    lines.push('')
  }

  lines.push('Next Update: Market Open (9:35 AM ET)')
  lines.push(`Dashboard: ${data.dashboard_url}`)
  lines.push(`Manage preferences: ${data.preferences_url}`)
  lines.push(`Unsubscribe: ${data.unsubscribe_url}`)

  return lines.join('\n')
}

// Example usage
export async function sendBriefToUsers() {
  // Fetch morning brief data
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/analyst/morning-brief`)
  const { brief } = await response.json()

  // Get user email list (from database)
  const recipients = [
    {
      email: 'user@example.com',
      name: 'John Doe',
      user_id: 'user_123',
      dashboard_url: 'https://yourapp.com/dashboard'
    }
  ]

  const results = await sendMorningBrief(brief, recipients)

  return results
}
