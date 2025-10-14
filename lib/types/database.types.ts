export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      positions: {
        Row: {
          id: string
          user_id: string
          symbol: string
          strike: number
          expiration: string
          option_type: 'call' | 'put'
          contracts: number
          entry_price: number
          entry_date: string
          current_price: number | null
          status: 'open' | 'closed'
          exit_date: string | null
          exit_price: number | null
          created_at: string
          updated_at: string
          // Snapshot of data at entry
          entry_stock_price: number
          entry_iv: number | null
          entry_delta: number | null
          entry_theta: number | null
          entry_vega: number | null
          entry_gamma: number | null
          // Current metrics
          current_stock_price: number | null
          current_delta: number | null
          current_theta: number | null
          unrealized_pl: number | null
          unrealized_pl_percent: number | null
          realized_pl: number | null
          realized_pl_percent: number | null
          // Exit signals
          exit_signal: 'hold' | 'consider' | 'exit_now'
          exit_urgency_score: number
          exit_reasons: Json
          last_signal_check: string | null
          // Notes
          notes: string | null
          tags: string[] | null
        }
        Insert: {
          id?: string
          user_id: string
          symbol: string
          strike: number
          expiration: string
          option_type: 'call' | 'put'
          contracts: number
          entry_price: number
          entry_date?: string
          current_price?: number | null
          status?: 'open' | 'closed'
          exit_date?: string | null
          exit_price?: number | null
          created_at?: string
          updated_at?: string
          entry_stock_price: number
          entry_iv?: number | null
          entry_delta?: number | null
          entry_theta?: number | null
          entry_vega?: number | null
          entry_gamma?: number | null
          current_stock_price?: number | null
          current_delta?: number | null
          current_theta?: number | null
          unrealized_pl?: number | null
          unrealized_pl_percent?: number | null
          realized_pl?: number | null
          realized_pl_percent?: number | null
          exit_signal?: 'hold' | 'consider' | 'exit_now'
          exit_urgency_score?: number
          exit_reasons?: Json
          last_signal_check?: string | null
          notes?: string | null
          tags?: string[] | null
        }
        Update: {
          id?: string
          user_id?: string
          symbol?: string
          strike?: number
          expiration?: string
          option_type?: 'call' | 'put'
          contracts?: number
          entry_price?: number
          entry_date?: string
          current_price?: number | null
          status?: 'open' | 'closed'
          exit_date?: string | null
          exit_price?: number | null
          created_at?: string
          updated_at?: string
          entry_stock_price?: number
          entry_iv?: number | null
          entry_delta?: number | null
          entry_theta?: number | null
          entry_vega?: number | null
          entry_gamma?: number | null
          current_stock_price?: number | null
          current_delta?: number | null
          current_theta?: number | null
          unrealized_pl?: number | null
          unrealized_pl_percent?: number | null
          realized_pl?: number | null
          realized_pl_percent?: number | null
          exit_signal?: 'hold' | 'consider' | 'exit_now'
          exit_urgency_score?: number
          exit_reasons?: Json
          last_signal_check?: string | null
          notes?: string | null
          tags?: string[] | null
        }
      }
      alerts: {
        Row: {
          id: string
          user_id: string
          position_id: string | null
          alert_type: 'profit_target' | 'stop_loss' | 'theta_warning' | 'exit_recommended'
          threshold_value: number | null
          triggered: boolean
          triggered_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          position_id?: string | null
          alert_type: 'profit_target' | 'stop_loss' | 'theta_warning' | 'exit_recommended'
          threshold_value?: number | null
          triggered?: boolean
          triggered_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          position_id?: string | null
          alert_type?: 'profit_target' | 'stop_loss' | 'theta_warning' | 'exit_recommended'
          threshold_value?: number | null
          triggered?: boolean
          triggered_at?: string | null
          created_at?: string
        }
      }
    }
  }
}
