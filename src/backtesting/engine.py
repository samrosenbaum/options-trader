"""Institutional-grade backtesting engine for options trading strategies.

This module provides comprehensive backtesting capabilities with proper statistical
validation, walk-forward analysis, and institutional performance metrics.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional, Tuple, Any, Callable
from enum import Enum
import pandas as pd
import numpy as np
from pathlib import Path
import logging
from concurrent.futures import ThreadPoolExecutor
import json

# Set up logging
logger = logging.getLogger(__name__)


class TradeStatus(Enum):
    """Status of a trade in the backtest."""
    OPEN = "open"
    CLOSED_PROFIT = "closed_profit"
    CLOSED_LOSS = "closed_loss"
    EXPIRED_ITM = "expired_itm"
    EXPIRED_OTM = "expired_otm"
    STOPPED_OUT = "stopped_out"


@dataclass
class Trade:
    """Individual trade record with full lifecycle tracking."""
    
    # Trade identification
    trade_id: str
    symbol: str
    option_type: str  # "call" or "put"
    strike: float
    expiration: date
    
    # Entry data
    entry_date: datetime
    entry_price: float
    entry_stock_price: float
    contracts: int
    entry_score: float
    entry_reasons: List[str] = field(default_factory=list)
    
    # Exit data (populated when trade closes)
    exit_date: Optional[datetime] = None
    exit_price: Optional[float] = None
    exit_stock_price: Optional[float] = None
    exit_reason: str = ""
    status: TradeStatus = TradeStatus.OPEN
    
    # P&L calculations
    gross_pnl: float = 0.0
    commission: float = 0.0
    net_pnl: float = 0.0
    return_pct: float = 0.0
    annualized_return: float = 0.0
    
    # Risk metrics
    max_favorable_excursion: float = 0.0  # Best unrealized P&L
    max_adverse_excursion: float = 0.0    # Worst unrealized P&L
    days_held: int = 0
    
    # Greeks at entry
    entry_delta: float = 0.0
    entry_gamma: float = 0.0
    entry_theta: float = 0.0
    entry_vega: float = 0.0
    entry_iv: float = 0.0
    
    # Market context
    entry_vix: Optional[float] = None
    market_regime: str = ""
    sector: str = ""
    
    # Metadata
    tags: List[str] = field(default_factory=list)
    
    def close_trade(self, exit_date: datetime, exit_price: float, exit_stock_price: float, 
                   exit_reason: str, commission_per_contract: float = 1.0) -> None:
        """Close the trade and calculate final P&L."""
        
        self.exit_date = exit_date
        self.exit_price = exit_price
        self.exit_stock_price = exit_stock_price
        self.exit_reason = exit_reason
        self.days_held = (exit_date.date() - self.entry_date.date()).days
        
        # Calculate P&L
        self.gross_pnl = (exit_price - self.entry_price) * self.contracts * 100
        self.commission = commission_per_contract * self.contracts * 2  # Entry + exit
        self.net_pnl = self.gross_pnl - self.commission
        
        # Calculate returns
        cost_basis = self.entry_price * self.contracts * 100
        if cost_basis > 0:
            self.return_pct = self.net_pnl / cost_basis
            if self.days_held > 0:
                self.annualized_return = self.return_pct * (365.0 / self.days_held)
        
        # Set status
        if self.net_pnl > 0:
            self.status = TradeStatus.CLOSED_PROFIT
        else:
            self.status = TradeStatus.CLOSED_LOSS
            
    def update_unrealized_pnl(self, current_price: float) -> float:
        """Update max favorable/adverse excursion with current price."""
        
        unrealized_pnl = (current_price - self.entry_price) * self.contracts * 100
        
        if unrealized_pnl > self.max_favorable_excursion:
            self.max_favorable_excursion = unrealized_pnl
            
        if unrealized_pnl < self.max_adverse_excursion:
            self.max_adverse_excursion = unrealized_pnl
            
        return unrealized_pnl


@dataclass
class BacktestConfig:
    """Configuration for backtesting parameters."""
    
    # Date range
    start_date: datetime
    end_date: datetime
    
    # Capital management
    initial_capital: float = 100000.0
    max_portfolio_heat: float = 0.15  # Max 15% of capital at risk
    max_position_size: float = 0.05   # Max 5% per position
    commission_per_contract: float = 1.0
    
    # Entry/exit rules
    min_score_threshold: float = 70.0
    max_days_to_expiration: int = 60
    min_days_to_expiration: int = 7
    profit_target_pct: float = 0.50   # Take profit at 50% gain
    stop_loss_pct: float = -0.50      # Stop loss at 50% loss
    
    # Data quality filters
    min_volume: int = 10
    min_open_interest: int = 50
    max_spread_pct: float = 0.15
    
    # Portfolio limits
    max_positions: int = 20
    max_positions_per_symbol: int = 3
    max_sector_concentration: float = 0.30
    
    # Walk-forward parameters
    optimization_window_days: int = 252  # 1 year
    out_of_sample_days: int = 63        # 3 months
    reoptimize_frequency_days: int = 30  # Monthly reoptimization


@dataclass
class PerformanceMetrics:
    """Comprehensive performance analytics."""
    
    # Basic metrics
    total_trades: int = 0
    winning_trades: int = 0  
    losing_trades: int = 0
    win_rate: float = 0.0
    
    # P&L metrics
    gross_pnl: float = 0.0
    net_pnl: float = 0.0
    total_commissions: float = 0.0
    largest_win: float = 0.0
    largest_loss: float = 0.0
    average_win: float = 0.0
    average_loss: float = 0.0
    profit_factor: float = 0.0
    
    # Risk-adjusted metrics
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    calmar_ratio: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_duration: int = 0
    
    # Advanced metrics
    expectancy: float = 0.0  # Average $ per trade
    kelly_fraction: float = 0.0
    var_95: float = 0.0  # Value at Risk (95th percentile)
    cvar_95: float = 0.0  # Conditional VaR
    
    # Time-based metrics
    total_days: int = 0
    trading_days: int = 0
    avg_days_per_trade: float = 0.0
    
    # Efficiency metrics
    mae_ratio: float = 0.0   # Max Adverse Excursion ratio
    mfe_ratio: float = 0.0   # Max Favorable Excursion ratio
    
    # Monthly/yearly breakdowns
    monthly_returns: Dict[str, float] = field(default_factory=dict)
    yearly_returns: Dict[str, float] = field(default_factory=dict)
    
    # Statistical significance
    t_statistic: float = 0.0
    p_value: float = 0.0


class BacktestEngine:
    """Comprehensive backtesting engine for options strategies."""
    
    def __init__(self, config: BacktestConfig):
        """Initialize backtesting engine with configuration."""
        self.config = config
        self.trades: List[Trade] = []
        self.equity_curve: List[Tuple[datetime, float]] = []
        self.open_positions: List[Trade] = []
        self.current_capital = config.initial_capital
        self.peak_capital = config.initial_capital
        
    def run_backtest(
        self, 
        historical_opportunities: pd.DataFrame,
        historical_prices: pd.DataFrame,
        scoring_function: Callable = None,
        custom_exit_logic: Callable = None
    ) -> PerformanceMetrics:
        """Run complete backtesting simulation.
        
        Args:
            historical_opportunities: DataFrame with historical option opportunities
            historical_prices: DataFrame with historical stock/option prices
            scoring_function: Optional custom scoring function
            custom_exit_logic: Optional custom exit rules
            
        Returns:
            Comprehensive performance metrics
        """
        
        logger.info(f"Starting backtest from {self.config.start_date} to {self.config.end_date}")
        
        # Initialize tracking
        self.trades.clear()
        self.open_positions.clear()
        self.current_capital = self.config.initial_capital
        self.peak_capital = self.config.initial_capital
        self.equity_curve = [(self.config.start_date, self.current_capital)]
        
        # Filter data to backtest period
        opportunities = historical_opportunities[
            (historical_opportunities['date'] >= self.config.start_date) &
            (historical_opportunities['date'] <= self.config.end_date)
        ].copy()
        
        # Group by date for daily processing
        daily_opportunities = opportunities.groupby('date')
        
        current_date = self.config.start_date
        
        while current_date <= self.config.end_date:
            # Process this day's opportunities
            if current_date.strftime('%Y-%m-%d') in daily_opportunities.groups:
                daily_opps = daily_opportunities.get_group(current_date)
                self._process_daily_opportunities(daily_opps, current_date)
            
            # Update open positions with current prices
            self._update_open_positions(current_date, historical_prices)
            
            # Check exit conditions
            self._check_exit_conditions(current_date, historical_prices, custom_exit_logic)
            
            # Update equity curve
            portfolio_value = self._calculate_portfolio_value(current_date, historical_prices)
            self.equity_curve.append((current_date, portfolio_value))
            self.current_capital = portfolio_value
            
            if portfolio_value > self.peak_capital:
                self.peak_capital = portfolio_value
                
            current_date += timedelta(days=1)
            
        # Close any remaining open positions
        self._close_remaining_positions(self.config.end_date, historical_prices)
        
        # Calculate final performance metrics
        return self._calculate_performance_metrics()
    
    def run_walk_forward_analysis(
        self,
        historical_data: pd.DataFrame,
        parameter_ranges: Dict[str, List[float]],
        optimization_metric: str = 'sharpe_ratio'
    ) -> Dict[str, Any]:
        """Run walk-forward analysis to avoid overfitting.
        
        Args:
            historical_data: Complete historical dataset
            parameter_ranges: Dict of parameter names to lists of values to test
            optimization_metric: Metric to optimize ('sharpe_ratio', 'profit_factor', etc.)
            
        Returns:
            Walk-forward analysis results with out-of-sample performance
        """
        
        logger.info("Starting walk-forward analysis")
        
        results = {
            'periods': [],
            'optimal_parameters': [],
            'in_sample_performance': [],
            'out_of_sample_performance': [],
            'aggregate_performance': None
        }
        
        current_date = self.config.start_date
        
        while current_date < self.config.end_date:
            # Define training period
            train_start = current_date
            train_end = current_date + timedelta(days=self.config.optimization_window_days)
            
            # Define testing period  
            test_start = train_end + timedelta(days=1)
            test_end = test_start + timedelta(days=self.config.out_of_sample_days)
            
            if test_end > self.config.end_date:
                test_end = self.config.end_date
                
            logger.info(f"Optimizing on {train_start} to {train_end}, testing {test_start} to {test_end}")
            
            # Optimize parameters on training data
            train_data = historical_data[
                (historical_data['date'] >= train_start) & 
                (historical_data['date'] <= train_end)
            ]
            
            optimal_params = self._optimize_parameters(
                train_data, parameter_ranges, optimization_metric
            )
            
            # Test on out-of-sample data
            test_data = historical_data[
                (historical_data['date'] >= test_start) & 
                (historical_data['date'] <= test_end)
            ]
            
            # Update config with optimal parameters
            test_config = self._update_config_with_params(optimal_params)
            test_engine = BacktestEngine(test_config)
            
            oos_performance = test_engine.run_backtest(test_data, historical_data)
            
            results['periods'].append((train_start, train_end, test_start, test_end))
            results['optimal_parameters'].append(optimal_params)
            results['out_of_sample_performance'].append(oos_performance)
            
            # Move to next period
            current_date = test_start
            
        # Calculate aggregate out-of-sample performance
        results['aggregate_performance'] = self._aggregate_walk_forward_results(
            results['out_of_sample_performance']
        )
        
        return results
    
    def monte_carlo_analysis(
        self,
        historical_data: pd.DataFrame,
        num_simulations: int = 1000,
        bootstrap_window: int = 252
    ) -> Dict[str, Any]:
        """Run Monte Carlo simulation to assess strategy robustness.
        
        Args:
            historical_data: Historical data for simulation
            num_simulations: Number of Monte Carlo runs
            bootstrap_window: Days to use for bootstrap sampling
            
        Returns:
            Monte Carlo simulation results with confidence intervals
        """
        
        logger.info(f"Running {num_simulations} Monte Carlo simulations")
        
        simulation_results = []
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = []
            
            for i in range(num_simulations):
                # Bootstrap sample from historical data
                sampled_data = self._bootstrap_sample(historical_data, bootstrap_window)
                
                # Submit simulation
                future = executor.submit(self._run_single_simulation, sampled_data, i)
                futures.append(future)
            
            # Collect results
            for future in futures:
                result = future.result()
                if result:
                    simulation_results.append(result)
        
        # Analyze simulation results
        return self._analyze_monte_carlo_results(simulation_results)
    
    def _process_daily_opportunities(
        self, 
        opportunities: pd.DataFrame, 
        current_date: datetime
    ) -> None:
        """Process opportunities for a single day."""
        
        # Filter by minimum score
        qualified_opps = opportunities[
            opportunities['score'] >= self.config.min_score_threshold
        ].copy()
        
        if qualified_opps.empty:
            return
            
        # Apply data quality filters
        qualified_opps = self._apply_quality_filters(qualified_opps)
        
        # Sort by score (highest first)
        qualified_opps = qualified_opps.sort_values('score', ascending=False)
        
        # Apply position limits
        for _, opp in qualified_opps.iterrows():
            if not self._can_add_position(opp):
                continue
                
            # Calculate position size
            position_size = self._calculate_position_size(opp)
            if position_size == 0:
                continue
                
            # Enter the trade
            trade = self._enter_trade(opp, current_date, position_size)
            if trade:
                self.trades.append(trade)
                self.open_positions.append(trade)
                
            # Check if we've hit max positions
            if len(self.open_positions) >= self.config.max_positions:
                break
    
    def _apply_quality_filters(self, opportunities: pd.DataFrame) -> pd.DataFrame:
        """Apply data quality filters to opportunities."""
        
        filtered = opportunities[
            (opportunities['volume'] >= self.config.min_volume) &
            (opportunities['openInterest'] >= self.config.min_open_interest) &
            (opportunities['days_to_expiration'] >= self.config.min_days_to_expiration) &
            (opportunities['days_to_expiration'] <= self.config.max_days_to_expiration)
        ].copy()
        
        # Calculate spread percentage
        filtered['spread_pct'] = (filtered['ask'] - filtered['bid']) / ((filtered['ask'] + filtered['bid']) / 2)
        filtered = filtered[filtered['spread_pct'] <= self.config.max_spread_pct]
        
        return filtered
    
    def _can_add_position(self, opportunity: Dict[str, Any]) -> bool:
        """Check if we can add this position given portfolio limits."""
        
        # Check max positions
        if len(self.open_positions) >= self.config.max_positions:
            return False
            
        # Check positions per symbol
        symbol_positions = len([p for p in self.open_positions if p.symbol == opportunity['symbol']])
        if symbol_positions >= self.config.max_positions_per_symbol:
            return False
            
        # Check sector concentration (if available)
        if 'sector' in opportunity:
            sector_capital = sum(
                p.entry_price * p.contracts * 100 
                for p in self.open_positions 
                if p.sector == opportunity.get('sector', '')
            )
            sector_pct = sector_capital / self.current_capital
            if sector_pct >= self.config.max_sector_concentration:
                return False
                
        return True
    
    def _calculate_position_size(self, opportunity: Dict[str, Any]) -> int:
        """Calculate appropriate position size based on risk management rules."""
        
        option_premium = (opportunity['bid'] + opportunity['ask']) / 2
        cost_per_contract = option_premium * 100
        
        # Risk-based sizing
        max_risk_capital = self.current_capital * self.config.max_position_size
        max_contracts_by_risk = int(max_risk_capital / cost_per_contract)
        
        # Heat limit (total capital at risk)
        current_heat = sum(p.entry_price * p.contracts * 100 for p in self.open_positions)
        remaining_heat = (self.current_capital * self.config.max_portfolio_heat) - current_heat
        max_contracts_by_heat = int(remaining_heat / cost_per_contract) if remaining_heat > 0 else 0
        
        # Take minimum of constraints
        contracts = min(max_contracts_by_risk, max_contracts_by_heat, 10)  # Cap at 10 contracts
        
        return max(0, contracts)
    
    def _enter_trade(self, opportunity: Dict[str, Any], entry_date: datetime, contracts: int) -> Optional[Trade]:
        """Enter a new trade."""
        
        if contracts <= 0:
            return None
            
        trade_id = f"{opportunity['symbol']}_{opportunity['strike']}_{opportunity['type']}_{entry_date.strftime('%Y%m%d')}"
        
        # Calculate entry price (use mid-point)
        entry_price = (opportunity['bid'] + opportunity['ask']) / 2
        
        trade = Trade(
            trade_id=trade_id,
            symbol=opportunity['symbol'],
            option_type=opportunity['type'],
            strike=opportunity['strike'],
            expiration=pd.to_datetime(opportunity['expiration']).date(),
            entry_date=entry_date,
            entry_price=entry_price,
            entry_stock_price=opportunity['stockPrice'],
            contracts=contracts,
            entry_score=opportunity['score'],
            entry_reasons=opportunity.get('reasons', []),
            entry_delta=opportunity.get('delta', 0),
            entry_gamma=opportunity.get('gamma', 0),
            entry_theta=opportunity.get('theta', 0),
            entry_vega=opportunity.get('vega', 0),
            entry_iv=opportunity.get('impliedVolatility', 0),
            sector=opportunity.get('sector', ''),
            tags=opportunity.get('tags', [])
        )
        
        logger.debug(f"Entered trade: {trade_id} - {contracts} contracts @ ${entry_price:.2f}")
        
        return trade
    
    def _update_open_positions(self, current_date: datetime, historical_prices: pd.DataFrame) -> None:
        """Update unrealized P&L for open positions."""
        
        for trade in self.open_positions:
            current_price = self._get_current_option_price(trade, current_date, historical_prices)
            if current_price is not None:
                trade.update_unrealized_pnl(current_price)
    
    def _check_exit_conditions(
        self, 
        current_date: datetime, 
        historical_prices: pd.DataFrame,
        custom_exit_logic: Callable = None
    ) -> None:
        """Check exit conditions for open positions."""
        
        positions_to_close = []
        
        for trade in self.open_positions:
            current_price = self._get_current_option_price(trade, current_date, historical_prices)
            if current_price is None:
                continue
                
            current_stock_price = self._get_current_stock_price(trade.symbol, current_date, historical_prices)
            
            # Check expiration
            if current_date.date() >= trade.expiration:
                exit_reason = "expiration"
                positions_to_close.append((trade, current_price, current_stock_price, exit_reason))
                continue
            
            # Check profit target
            unrealized_return = (current_price - trade.entry_price) / trade.entry_price
            if unrealized_return >= self.config.profit_target_pct:
                exit_reason = "profit_target"
                positions_to_close.append((trade, current_price, current_stock_price, exit_reason))
                continue
                
            # Check stop loss
            if unrealized_return <= self.config.stop_loss_pct:
                exit_reason = "stop_loss"
                positions_to_close.append((trade, current_price, current_stock_price, exit_reason))
                continue
            
            # Custom exit logic
            if custom_exit_logic and custom_exit_logic(trade, current_price, current_stock_price, current_date):
                exit_reason = "custom_exit"
                positions_to_close.append((trade, current_price, current_stock_price, exit_reason))
                continue
        
        # Close positions
        for trade, exit_price, exit_stock_price, exit_reason in positions_to_close:
            trade.close_trade(current_date, exit_price, exit_stock_price, exit_reason, self.config.commission_per_contract)
            self.open_positions.remove(trade)
            
            logger.debug(f"Closed trade: {trade.trade_id} - ${trade.net_pnl:.2f} ({trade.return_pct:.1%})")
    
    def _get_current_option_price(self, trade: Trade, current_date: datetime, historical_prices: pd.DataFrame) -> Optional[float]:
        """Get current option price from historical data."""
        
        # This is a simplified implementation - in reality you'd need option pricing data
        # For now, we'll estimate using intrinsic value and time decay
        
        current_stock_price = self._get_current_stock_price(trade.symbol, current_date, historical_prices)
        if current_stock_price is None:
            return None
            
        # Calculate intrinsic value
        if trade.option_type.lower() == "call":
            intrinsic = max(0, current_stock_price - trade.strike)
        else:
            intrinsic = max(0, trade.strike - current_stock_price)
        
        # Estimate time value decay (simplified)
        days_elapsed = (current_date.date() - trade.entry_date.date()).days
        days_to_expiration = (trade.expiration - current_date.date()).days
        
        if days_to_expiration <= 0:
            return intrinsic
            
        # Rough time value estimation
        original_time_value = trade.entry_price - (
            max(0, trade.entry_stock_price - trade.strike) if trade.option_type.lower() == "call"
            else max(0, trade.strike - trade.entry_stock_price)
        )
        
        remaining_time_pct = days_to_expiration / ((trade.expiration - trade.entry_date.date()).days)
        remaining_time_value = original_time_value * np.sqrt(remaining_time_pct)  # Square root time decay
        
        estimated_price = intrinsic + max(0, remaining_time_value)
        
        return max(0.01, estimated_price)  # Minimum price of $0.01
    
    def _get_current_stock_price(self, symbol: str, current_date: datetime, historical_prices: pd.DataFrame) -> Optional[float]:
        """Get current stock price from historical data."""
        
        try:
            price_data = historical_prices[
                (historical_prices['symbol'] == symbol) &
                (historical_prices['date'] <= current_date)
            ].sort_values('date').tail(1)
            
            if not price_data.empty:
                return float(price_data.iloc[0]['close'])
                
        except Exception as e:
            logger.warning(f"Could not get stock price for {symbol} on {current_date}: {e}")
            
        return None
    
    def _calculate_portfolio_value(self, current_date: datetime, historical_prices: pd.DataFrame) -> float:
        """Calculate current portfolio value including open positions."""
        
        # Start with realized P&L
        realized_pnl = sum(trade.net_pnl for trade in self.trades if trade.status != TradeStatus.OPEN)
        
        # Add unrealized P&L from open positions
        unrealized_pnl = 0.0
        for trade in self.open_positions:
            current_price = self._get_current_option_price(trade, current_date, historical_prices)
            if current_price is not None:
                unrealized_pnl += (current_price - trade.entry_price) * trade.contracts * 100
        
        return self.config.initial_capital + realized_pnl + unrealized_pnl
    
    def _close_remaining_positions(self, final_date: datetime, historical_prices: pd.DataFrame) -> None:
        """Close any remaining open positions at the end of backtest."""
        
        for trade in self.open_positions[:]:  # Create copy to modify during iteration
            final_price = self._get_current_option_price(trade, final_date, historical_prices)
            final_stock_price = self._get_current_stock_price(trade.symbol, final_date, historical_prices)
            
            if final_price is not None and final_stock_price is not None:
                trade.close_trade(final_date, final_price, final_stock_price, "backtest_end", self.config.commission_per_contract)
            
        self.open_positions.clear()
    
    def _calculate_performance_metrics(self) -> PerformanceMetrics:
        """Calculate comprehensive performance metrics."""
        
        if not self.trades:
            return PerformanceMetrics()
        
        # Basic trade statistics
        closed_trades = [t for t in self.trades if t.status != TradeStatus.OPEN]
        winning_trades = [t for t in closed_trades if t.net_pnl > 0]
        losing_trades = [t for t in closed_trades if t.net_pnl <= 0]
        
        metrics = PerformanceMetrics()
        metrics.total_trades = len(closed_trades)
        metrics.winning_trades = len(winning_trades)
        metrics.losing_trades = len(losing_trades)
        metrics.win_rate = len(winning_trades) / len(closed_trades) if closed_trades else 0
        
        # P&L metrics
        metrics.net_pnl = sum(t.net_pnl for t in closed_trades)
        metrics.gross_pnl = sum(t.gross_pnl for t in closed_trades)
        metrics.total_commissions = sum(t.commission for t in closed_trades)
        
        if winning_trades:
            metrics.largest_win = max(t.net_pnl for t in winning_trades)
            metrics.average_win = np.mean([t.net_pnl for t in winning_trades])
        
        if losing_trades:
            metrics.largest_loss = min(t.net_pnl for t in losing_trades)
            metrics.average_loss = np.mean([t.net_pnl for t in losing_trades])
        
        # Profit factor
        if losing_trades:
            total_wins = sum(t.net_pnl for t in winning_trades)
            total_losses = abs(sum(t.net_pnl for t in losing_trades))
            metrics.profit_factor = total_wins / total_losses if total_losses > 0 else float('inf')
        
        # Expectancy
        metrics.expectancy = metrics.net_pnl / len(closed_trades) if closed_trades else 0
        
        # Risk metrics from equity curve
        if len(self.equity_curve) > 1:
            equity_values = [val for _, val in self.equity_curve]
            daily_returns = np.diff(equity_values) / equity_values[:-1]
            
            # Sharpe ratio (assume risk-free rate = 0 for simplicity)
            if len(daily_returns) > 0 and np.std(daily_returns) > 0:
                metrics.sharpe_ratio = np.mean(daily_returns) / np.std(daily_returns) * np.sqrt(252)
            
            # Max drawdown
            peak = equity_values[0]
            max_dd = 0
            dd_duration = 0
            current_dd_duration = 0
            
            for value in equity_values:
                if value > peak:
                    peak = value
                    current_dd_duration = 0
                else:
                    drawdown = (peak - value) / peak
                    max_dd = max(max_dd, drawdown)
                    current_dd_duration += 1
                    dd_duration = max(dd_duration, current_dd_duration)
            
            metrics.max_drawdown = max_dd
            metrics.max_drawdown_duration = dd_duration
            
            # Calmar ratio
            if max_dd > 0:
                annual_return = (equity_values[-1] / equity_values[0]) ** (252 / len(equity_values)) - 1
                metrics.calmar_ratio = annual_return / max_dd
        
        # Time-based metrics
        if closed_trades:
            metrics.total_days = (self.config.end_date - self.config.start_date).days
            metrics.avg_days_per_trade = np.mean([t.days_held for t in closed_trades])
        
        return metrics
    
    def _optimize_parameters(
        self, 
        train_data: pd.DataFrame, 
        parameter_ranges: Dict[str, List[float]],
        optimization_metric: str
    ) -> Dict[str, float]:
        """Optimize parameters on training data using grid search."""
        
        from itertools import product
        
        param_names = list(parameter_ranges.keys())
        param_values = list(parameter_ranges.values())
        
        best_params = {}
        best_score = float('-inf') if optimization_metric in ['sharpe_ratio', 'profit_factor'] else float('inf')
        
        for param_combination in product(*param_values):
            params = dict(zip(param_names, param_combination))
            
            # Create temporary config with these parameters
            temp_config = self._update_config_with_params(params)
            temp_engine = BacktestEngine(temp_config)
            
            # Run backtest
            try:
                performance = temp_engine.run_backtest(train_data, train_data)  # Use same data for prices
                score = getattr(performance, optimization_metric, 0)
                
                is_better = (
                    score > best_score if optimization_metric in ['sharpe_ratio', 'profit_factor', 'win_rate']
                    else score < best_score
                )
                
                if is_better:
                    best_score = score
                    best_params = params.copy()
                    
            except Exception as e:
                logger.warning(f"Optimization failed for params {params}: {e}")
                continue
        
        return best_params
    
    def _update_config_with_params(self, params: Dict[str, float]) -> BacktestConfig:
        """Update configuration with optimized parameters."""
        
        new_config = BacktestConfig(
            start_date=self.config.start_date,
            end_date=self.config.end_date,
            initial_capital=self.config.initial_capital,
            max_portfolio_heat=params.get('max_portfolio_heat', self.config.max_portfolio_heat),
            max_position_size=params.get('max_position_size', self.config.max_position_size),
            commission_per_contract=self.config.commission_per_contract,
            min_score_threshold=params.get('min_score_threshold', self.config.min_score_threshold),
            profit_target_pct=params.get('profit_target_pct', self.config.profit_target_pct),
            stop_loss_pct=params.get('stop_loss_pct', self.config.stop_loss_pct),
            max_days_to_expiration=int(params.get('max_days_to_expiration', self.config.max_days_to_expiration)),
            min_days_to_expiration=int(params.get('min_days_to_expiration', self.config.min_days_to_expiration)),
            min_volume=int(params.get('min_volume', self.config.min_volume)),
            min_open_interest=int(params.get('min_open_interest', self.config.min_open_interest)),
            max_spread_pct=params.get('max_spread_pct', self.config.max_spread_pct)
        )
        
        return new_config
    
    def _bootstrap_sample(self, data: pd.DataFrame, window_days: int) -> pd.DataFrame:
        """Create bootstrap sample from historical data."""
        
        unique_dates = sorted(data['date'].unique())
        if len(unique_dates) < window_days:
            return data
            
        # Randomly sample dates with replacement
        sampled_dates = np.random.choice(unique_dates, size=window_days, replace=True)
        
        sampled_data = data[data['date'].isin(sampled_dates)].copy()
        return sampled_data
    
    def _run_single_simulation(self, data: pd.DataFrame, simulation_id: int) -> Optional[Dict]:
        """Run a single Monte Carlo simulation."""
        
        try:
            temp_engine = BacktestEngine(self.config)
            performance = temp_engine.run_backtest(data, data)
            
            return {
                'simulation_id': simulation_id,
                'net_pnl': performance.net_pnl,
                'win_rate': performance.win_rate,
                'sharpe_ratio': performance.sharpe_ratio,
                'max_drawdown': performance.max_drawdown,
                'total_trades': performance.total_trades
            }
            
        except Exception as e:
            logger.warning(f"Simulation {simulation_id} failed: {e}")
            return None
    
    def _analyze_monte_carlo_results(self, results: List[Dict]) -> Dict[str, Any]:
        """Analyze Monte Carlo simulation results."""
        
        if not results:
            return {}
        
        # Extract metrics
        net_pnls = [r['net_pnl'] for r in results]
        win_rates = [r['win_rate'] for r in results]
        sharpe_ratios = [r['sharpe_ratio'] for r in results]
        max_drawdowns = [r['max_drawdown'] for r in results]
        
        analysis = {
            'num_simulations': len(results),
            'net_pnl': {
                'mean': np.mean(net_pnls),
                'std': np.std(net_pnls),
                'percentiles': {
                    '5th': np.percentile(net_pnls, 5),
                    '25th': np.percentile(net_pnls, 25),
                    '50th': np.percentile(net_pnls, 50),
                    '75th': np.percentile(net_pnls, 75),
                    '95th': np.percentile(net_pnls, 95)
                }
            },
            'win_rate': {
                'mean': np.mean(win_rates),
                'std': np.std(win_rates),
                'percentiles': {
                    '5th': np.percentile(win_rates, 5),
                    '95th': np.percentile(win_rates, 95)
                }
            },
            'probability_of_profit': sum(1 for pnl in net_pnls if pnl > 0) / len(net_pnls),
            'expected_max_drawdown': np.mean(max_drawdowns),
            'worst_case_scenario': min(net_pnls),
            'best_case_scenario': max(net_pnls)
        }
        
        return analysis
    
    def _aggregate_walk_forward_results(self, performance_list: List[PerformanceMetrics]) -> PerformanceMetrics:
        """Aggregate walk-forward results into single performance metric."""
        
        if not performance_list:
            return PerformanceMetrics()
        
        # Aggregate key metrics
        total_trades = sum(p.total_trades for p in performance_list)
        total_net_pnl = sum(p.net_pnl for p in performance_list)
        total_winning = sum(p.winning_trades for p in performance_list)
        
        aggregate = PerformanceMetrics()
        aggregate.total_trades = total_trades
        aggregate.winning_trades = total_winning
        aggregate.losing_trades = total_trades - total_winning
        aggregate.win_rate = total_winning / total_trades if total_trades > 0 else 0
        aggregate.net_pnl = total_net_pnl
        aggregate.expectancy = total_net_pnl / total_trades if total_trades > 0 else 0
        
        # Use weighted averages for other metrics
        if performance_list:
            weights = [p.total_trades for p in performance_list]
            total_weight = sum(weights)
            
            if total_weight > 0:
                aggregate.sharpe_ratio = sum(p.sharpe_ratio * w for p, w in zip(performance_list, weights)) / total_weight
                aggregate.max_drawdown = max(p.max_drawdown for p in performance_list)
        
        return aggregate


__all__ = [
    "Trade",
    "TradeStatus", 
    "BacktestConfig",
    "PerformanceMetrics",
    "BacktestEngine"
]