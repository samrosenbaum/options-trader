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
          peak_unrealized_pl: number | null
          peak_unrealized_pl_percent: number | null
          peak_option_price: number | null
          last_catalyst_review: string | null
          contextual_insights: Json | null
          pending_alerts: Json | null
          last_profit_alert_threshold: number | null
          last_profit_alert_at: string | null
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
          peak_unrealized_pl?: number | null
          peak_unrealized_pl_percent?: number | null
          peak_option_price?: number | null
          last_catalyst_review?: string | null
          contextual_insights?: Json | null
          pending_alerts?: Json | null
          last_profit_alert_threshold?: number | null
          last_profit_alert_at?: string | null
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
          peak_unrealized_pl?: number | null
          peak_unrealized_pl_percent?: number | null
          peak_option_price?: number | null
          last_catalyst_review?: string | null
          contextual_insights?: Json | null
          pending_alerts?: Json | null
          last_profit_alert_threshold?: number | null
          last_profit_alert_at?: string | null
          exit_signal?: 'hold' | 'consider' | 'exit_now'
          exit_urgency_score?: number
          exit_reasons?: Json
          last_signal_check?: string | null
          notes?: string | null
          tags?: string[] | null
        }
      }
      drop_risk_signals: {
        Row: {
          id: string
          symbol: string
          drop_risk_score: number
          bias_score: number
          confidence: number
          stock_price: number | null
          price_change_pct: number | null
          alert_level: string
          drivers: Json
          signal_details: Json
          score_change: number | null
          generated_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          symbol: string
          drop_risk_score: number
          bias_score: number
          confidence: number
          stock_price?: number | null
          price_change_pct?: number | null
          alert_level?: string
          drivers?: Json
          signal_details: Json
          score_change?: number | null
          generated_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          symbol?: string
          drop_risk_score?: number
          bias_score?: number
          confidence?: number
          stock_price?: number | null
          price_change_pct?: number | null
          alert_level?: string
          drivers?: Json
          signal_details?: Json
          score_change?: number | null
          generated_at?: string
          created_at?: string
          updated_at?: string
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
      user_settings: {
        Row: {
          user_id: string
          portfolio_size: number | null
          daily_contract_budget: number | null
          user_name: string | null
          trading_desk_name: string | null
          broker: string | null
          trading_strategy: string | null
          has_completed_first_scan: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          portfolio_size?: number | null
          daily_contract_budget?: number | null
          user_name?: string | null
          trading_desk_name?: string | null
          broker?: string | null
          trading_strategy?: string | null
          has_completed_first_scan?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          portfolio_size?: number | null
          daily_contract_budget?: number | null
          user_name?: string | null
          trading_desk_name?: string | null
          broker?: string | null
          trading_strategy?: string | null
          has_completed_first_scan?: boolean | null
          created_at?: string
          updated_at?: string
        }
      }
      portfolio_snapshots: {
        Row: {
          id: string
          user_id: string
          snapshot_date: string
          total_value: number
          cash_value: number
          positions_value: number
          unrealized_pl: number
          realized_pl: number
          daily_change: number
          daily_change_percent: number
          open_positions_count: number
          closed_positions_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          snapshot_date: string
          total_value: number
          cash_value?: number
          positions_value: number
          unrealized_pl?: number
          realized_pl?: number
          daily_change?: number
          daily_change_percent?: number
          open_positions_count?: number
          closed_positions_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          snapshot_date?: string
          total_value?: number
          cash_value?: number
          positions_value?: number
          unrealized_pl?: number
          realized_pl?: number
          daily_change?: number
          daily_change_percent?: number
          open_positions_count?: number
          closed_positions_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      watchlist: {
        Row: {
          id: string
          user_id: string
          symbol: string
          option_type: 'call' | 'put'
          strike: number
          expiration: string
          premium: number
          score: number | null
          risk_level: string | null
          days_to_expiration: number | null
          trade_summary: string | null
          added_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          symbol: string
          option_type: 'call' | 'put'
          strike: number
          expiration: string
          premium: number
          score?: number | null
          risk_level?: string | null
          days_to_expiration?: number | null
          trade_summary?: string | null
          added_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          symbol?: string
          option_type?: 'call' | 'put'
          strike?: number
          expiration?: string
          premium?: number
          score?: number | null
          risk_level?: string | null
          days_to_expiration?: number | null
          trade_summary?: string | null
          added_at?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
