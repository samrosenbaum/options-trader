import { Resend } from 'resend'

// Lazy initialization - only create Resend client when needed (at runtime, not build time)
let resendClient: Resend | null = null

export function getResendClient() {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set in environment variables')
    }
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

// For backwards compatibility - export as 'resend' but as a getter
export const resend = {
  get emails() {
    return getResendClient().emails
  }
}

export const ANALYST_EMAIL_CONFIG = {
  from: 'Monty Analyst <onboarding@resend.dev>', // Resend's test email for development
  to: process.env.ANALYST_EMAIL_RECIPIENT || 'user@example.com',
  replyTo: 'noreply@example.com'
}

/**
 * Send morning brief email
 */
export async function sendMorningBrief(formattedText: string) {
  const resend = getResendClient()
  const { data, error } = await resend.emails.send({
    from: ANALYST_EMAIL_CONFIG.from,
    to: ANALYST_EMAIL_CONFIG.to,
    replyTo: ANALYST_EMAIL_CONFIG.replyTo,
    subject: `📊 Morning Brief - ${new Date().toLocaleDateString()}`,
    text: formattedText,
  })

  if (error) {
    console.error('Failed to send morning brief:', error)
    throw error
  }

  return data
}

/**
 * Send nightly brief email
 */
export async function sendNightlyBrief(formattedText: string) {
  const resend = getResendClient()
  const { data, error } = await resend.emails.send({
    from: ANALYST_EMAIL_CONFIG.from,
    to: ANALYST_EMAIL_CONFIG.to,
    replyTo: ANALYST_EMAIL_CONFIG.replyTo,
    subject: `🌙 Nightly Brief - Tomorrow's Battle Plan`,
    text: formattedText,
  })

  if (error) {
    console.error('Failed to send nightly brief:', error)
    throw error
  }

  return data
}

/**
 * Send market open update email
 */
export async function sendMarketOpenUpdate(formattedText: string) {
  const resend = getResendClient()
  const { data, error } = await resend.emails.send({
    from: ANALYST_EMAIL_CONFIG.from,
    to: ANALYST_EMAIL_CONFIG.to,
    replyTo: ANALYST_EMAIL_CONFIG.replyTo,
    subject: `🔔 Market Open Update - ${new Date().toLocaleTimeString()}`,
    text: formattedText,
  })

  if (error) {
    console.error('Failed to send market open update:', error)
    throw error
  }

  return data
}

/**
 * Send weekly analysis email
 */
export async function sendWeeklyAnalysis(formattedText: string) {
  const resend = getResendClient()
  const { data, error } = await resend.emails.send({
    from: ANALYST_EMAIL_CONFIG.from,
    to: ANALYST_EMAIL_CONFIG.to,
    replyTo: ANALYST_EMAIL_CONFIG.replyTo,
    subject: `📈 Weekly Performance Analysis - ${new Date().toLocaleDateString()}`,
    text: formattedText,
  })

  if (error) {
    console.error('Failed to send weekly analysis:', error)
    throw error
  }

  return data
}
