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
  }>
  uoa_signals: Record<string, any>
  watchlist: string[]
  portfolio_alerts: Array<{
    symbol: string
    alert_type: string
    message: string
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
      // Format UOA signals for email (top 3)
      const uoaSignalsArray = Object.entries(briefData.uoa_signals)
        .slice(0, 3)
        .map(([symbol, data]: [string, any]) => {
          // Get top call and put signals
          const topCall = data.call_signals?.length > 0
            ? {
                strike: data.call_signals[0].strike,
                volume: data.call_signals[0].volume,
                oi: data.call_signals[0].oi,
                vol_oi_ratio: data.call_signals[0].vol_oi_ratio.toFixed(1),
                is_atm: data.call_signals[0].is_atm
              }
            : null

          const topPut = data.put_signals?.length > 0
            ? {
                strike: data.put_signals[0].strike,
                volume: data.put_signals[0].volume,
                oi: data.put_signals[0].oi,
                vol_oi_ratio: data.put_signals[0].vol_oi_ratio.toFixed(1),
                is_atm: data.put_signals[0].is_atm
              }
            : null

          return {
            symbol,
            current_price: data.current_price.toFixed(2),
            bias: data.bias,
            total_unusual_volume: data.total_unusual_volume.toLocaleString(),
            call_signals: topCall ? [topCall] : [],
            put_signals: topPut ? [topPut] : []
          }
        })

      // Format market conditions
      const marketConditions = Object.entries(briefData.market_conditions).map(
        ([symbol, data]) => ({
          symbol,
          price: data.price.toFixed(2),
          trend: data.trend
        })
      )

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
        uoa_signals: uoaSignalsArray,
        watchlist: briefData.watchlist.slice(0, 10), // Top 10
        portfolio_alerts: briefData.portfolio_alerts,
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
  // For production, use a proper template engine like Handlebars
  // For now, simple template literal

  const uoaSignalsHTML = data.uoa_signals.map((signal: any) => `
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 15px; border-radius: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 18px; font-weight: 700; color: #0f172a;">${signal.symbol}</span>
        <span style="padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; background: ${signal.bias === 'bullish' ? '#d1fae5' : '#fee2e2'}; color: ${signal.bias === 'bullish' ? '#065f46' : '#991b1b'};">
          ${signal.bias}
        </span>
      </div>
      <div style="font-size: 14px; color: #475569;">
        Current Price: <strong>$${signal.current_price}</strong> &nbsp;|&nbsp;
        Total Unusual Volume: <strong>${signal.total_unusual_volume}</strong>
      </div>
      ${signal.call_signals.length > 0 ? `
        <div style="background: white; padding: 10px; margin-top: 10px; border-radius: 4px; font-family: 'Monaco', monospace; font-size: 13px;">
          🔥 Top Call: $${signal.call_signals[0].strike} &nbsp;
          <span style="color: #dc2626; font-weight: 700;">${signal.call_signals[0].vol_oi_ratio}x</span> vol/OI &nbsp;
          (${signal.call_signals[0].volume} vol / ${signal.call_signals[0].oi} OI)
          ${signal.call_signals[0].is_atm ? '<strong>[ATM]</strong>' : ''}
        </div>
      ` : ''}
      ${signal.put_signals.length > 0 ? `
        <div style="background: white; padding: 10px; margin-top: 10px; border-radius: 4px; font-family: 'Monaco', monospace; font-size: 13px;">
          📉 Top Put: $${signal.put_signals[0].strike} &nbsp;
          <span style="color: #dc2626; font-weight: 700;">${signal.put_signals[0].vol_oi_ratio}x</span> vol/OI &nbsp;
          (${signal.put_signals[0].volume} vol / ${signal.put_signals[0].oi} OI)
          ${signal.put_signals[0].is_atm ? '<strong>[ATM]</strong>' : ''}
        </div>
      ` : ''}
    </div>
  `).join('')

  const watchlistHTML = data.watchlist.map((symbol: string) =>
    `<div style="background: #f1f5f9; padding: 10px; text-align: center; border-radius: 6px; font-weight: 600;">${symbol}</div>`
  ).join('')

  const alertsHTML = data.portfolio_alerts?.map((alert: any) => `
    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 10px; border-radius: 4px;">
      <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-right: 8px; background: ${alert.urgency === 'high' ? '#dc2626' : '#f59e0b'}; color: white;">
        ${alert.urgency}
      </span>
      ${alert.message}
    </div>
  `).join('') || ''

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 700;">🌅 Morning Brief</h1>
      <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">${data.timestamp}</p>
    </div>

    <!-- Content -->
    <div style="padding: 20px;">
      <!-- Market Conditions -->
      <div style="margin-bottom: 30px; border-left: 4px solid #667eea; padding-left: 15px;">
        <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #0f172a;">📊 Market Conditions</h2>
        <div style="display: flex; gap: 20px;">
          ${data.market_conditions.map((mc: any) => `
            <div style="flex: 1; background: #f1f5f9; padding: 15px; border-radius: 8px;">
              <div style="font-weight: 700; font-size: 16px; margin-bottom: 5px;">${mc.symbol}</div>
              <div style="font-size: 20px; font-weight: 600; color: #0f172a;">$${mc.price}</div>
              <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 5px; color: ${mc.trend === 'bullish' ? '#10b981' : '#ef4444'};">
                ${mc.trend}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- UOA Signals -->
      ${data.uoa_signals.length > 0 ? `
        <div style="margin-bottom: 30px; border-left: 4px solid #667eea; padding-left: 15px;">
          <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #0f172a;">🔥 Unusual Options Activity</h2>
          <p style="font-size: 14px; color: #64748b; margin-bottom: 15px;">
            Smart money positioning detected. These signals often precede big moves.
          </p>
          ${uoaSignalsHTML}
        </div>
      ` : ''}

      <!-- Watchlist -->
      <div style="margin-bottom: 30px; border-left: 4px solid #667eea; padding-left: 15px;">
        <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #0f172a;">🎯 Today's Watchlist</h2>
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;">
          ${watchlistHTML}
        </div>
      </div>

      <!-- Portfolio Alerts -->
      ${data.portfolio_alerts?.length > 0 ? `
        <div style="margin-bottom: 30px; border-left: 4px solid #667eea; padding-left: 15px;">
          <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #0f172a;">⚠️ Portfolio Alerts</h2>
          ${alertsHTML}
        </div>
      ` : ''}

      <!-- CTA -->
      <div style="text-align: center;">
        <a href="${data.dashboard_url}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 20px 0;">
          View Full Dashboard →
        </a>
      </div>

      <!-- Next Update -->
      <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center; margin-top: 20px;">
        <strong>⏰ Next Update:</strong> Market Open (9:35 AM ET)
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 14px; color: #64748b;">
      <p style="margin: 0;">
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

/**
 * Render plain text version
 */
function renderMorningBriefText(data: any): string {
  const uoaText = data.uoa_signals.map((signal: any) => {
    let text = `\n${signal.symbol} (${signal.bias.toUpperCase()})\n`
    text += `  Current: $${signal.current_price} | Volume: ${signal.total_unusual_volume}\n`

    if (signal.call_signals.length > 0) {
      const call = signal.call_signals[0]
      text += `  🔥 Call: $${call.strike} - ${call.vol_oi_ratio}x vol/OI (${call.volume}/${call.oi})${call.is_atm ? ' [ATM]' : ''}\n`
    }

    if (signal.put_signals.length > 0) {
      const put = signal.put_signals[0]
      text += `  📉 Put: $${put.strike} - ${put.vol_oi_ratio}x vol/OI (${put.volume}/${put.oi})${put.is_atm ? ' [ATM]' : ''}\n`
    }

    return text
  }).join('\n')

  return `
🌅 MORNING BRIEF
${data.timestamp}

============================================================

📊 MARKET CONDITIONS

${data.market_conditions.map((mc: any) =>
  `${mc.symbol}: $${mc.price} (${mc.trend})`
).join('\n')}

============================================================

🔥 UNUSUAL OPTIONS ACTIVITY

Smart money positioning detected. These signals often precede big moves.
${uoaText}

============================================================

🎯 TODAY'S WATCHLIST

${data.watchlist.join(', ')}

${data.portfolio_alerts?.length > 0 ? `
============================================================

⚠️ PORTFOLIO ALERTS

${data.portfolio_alerts.map((alert: any) =>
  `[${alert.urgency.toUpperCase()}] ${alert.message}`
).join('\n')}
` : ''}

============================================================

⏰ Next Update: Market Open (9:35 AM ET)

View full dashboard: ${data.dashboard_url}

--
Generated by Monty - Your AI Options Analyst
Manage preferences: ${data.preferences_url}
Unsubscribe: ${data.unsubscribe_url}
  `.trim()
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
