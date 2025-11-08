"""
Stock Fundamentals Scanner

Analyzes stocks based on fundamental metrics to identify high-quality buy opportunities.
Evaluates valuation, growth, profitability, financial health, and analyst sentiment.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional
from src.signals.fundamental_health import FundamentalHealthCalculator


@dataclass
class FundamentalMetrics:
    """Container for fundamental metrics"""
    # Valuation
    pe_ratio: Optional[float] = None
    forward_pe: Optional[float] = None
    peg_ratio: Optional[float] = None
    ps_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    price_to_fcf: Optional[float] = None

    # Growth
    revenue_growth: Optional[float] = None
    earnings_growth: Optional[float] = None
    revenue_per_share_growth: Optional[float] = None

    # Profitability
    profit_margin: Optional[float] = None
    operating_margin: Optional[float] = None
    roe: Optional[float] = None
    roa: Optional[float] = None
    roic: Optional[float] = None

    # Financial health
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None
    quick_ratio: Optional[float] = None
    free_cash_flow: Optional[float] = None
    operating_cash_flow: Optional[float] = None

    # Price context
    current_price: Optional[float] = None
    week_52_high: Optional[float] = None
    week_52_low: Optional[float] = None
    percent_from_52w_high: Optional[float] = None
    percent_from_52w_low: Optional[float] = None

    # Analyst data
    analyst_rating: Optional[str] = None
    target_price: Optional[float] = None
    target_upside_pct: Optional[float] = None
    num_analysts: Optional[int] = None
    recommendation_mean: Optional[float] = None

    # Market data
    market_cap: Optional[float] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    avg_volume: Optional[int] = None


@dataclass
class FundamentalSignal:
    """Represents a buy signal based on fundamentals"""
    symbol: str
    overall_score: int  # 0-100
    quality_level: str  # 'excellent', 'good', 'fair', 'poor'
    recommendation: str
    buy_reason: str

    # Component scores
    health_score: float
    growth_score: float
    profitability_score: float
    leverage_score: float
    valuation_score: float

    # Metrics
    metrics: FundamentalMetrics

    # Analysis
    strengths: List[str]
    weaknesses: List[str]
    catalysts: List[str]
    risk_level: str
    risk_factors: List[str]

    timestamp: datetime


class FundamentalsScanner:
    """Scans stocks for fundamental buy opportunities"""

    # Quality filters
    MIN_MARKET_CAP = 1_000_000_000  # $1B minimum
    MIN_AVG_VOLUME = 500_000  # 500K shares/day minimum
    MIN_DATA_COMPLETENESS = 0.6  # Must have 60% of key metrics

    def __init__(self):
        self.health_calculator = FundamentalHealthCalculator()

    def analyze_stock(self, symbol: str, ticker_info: Dict[str, Any]) -> Optional[FundamentalSignal]:
        """
        Analyze a stock's fundamentals and generate a buy signal if appropriate.

        Args:
            symbol: Stock ticker symbol
            ticker_info: Dictionary from yfinance ticker.info

        Returns:
            FundamentalSignal if stock meets criteria, None otherwise
        """
        # Quality filter: Check minimum requirements
        if not self._meets_quality_filters(ticker_info):
            return None
        # Extract metrics
        metrics = self._extract_metrics(symbol, ticker_info)

        # Calculate component scores
        health_result = self.health_calculator.calculate(ticker_info)
        health_score = health_result['health_score']

        growth_score = self._score_growth(metrics)
        profitability_score = self._score_profitability(metrics)
        leverage_score = self._score_leverage(metrics)
        valuation_score = self._score_valuation(metrics)

        # Calculate overall score (weighted average)
        overall_score = self._calculate_overall_score(
            health_score,
            growth_score,
            profitability_score,
            leverage_score,
            valuation_score
        )

        # Determine quality level
        quality_level = self._determine_quality_level(overall_score)

        # Generate analysis
        strengths = self._identify_strengths(metrics, health_result)
        weaknesses = self._identify_weaknesses(metrics, health_result)
        catalysts = self._identify_catalysts(ticker_info)

        # Comprehensive risk assessment with validation
        risk_factors = self._identify_risk_factors(metrics, health_result)

        # Add validation warnings
        analyst_warnings = self._validate_against_analysts(overall_score, metrics)
        value_trap_warnings = self._check_value_trap_indicators(metrics)
        growth_trap_warnings = self._check_growth_trap_indicators(metrics)

        # Combine all risk factors
        risk_factors.extend(analyst_warnings)
        risk_factors.extend(value_trap_warnings)
        risk_factors.extend(growth_trap_warnings)

        # Generate recommendation
        recommendation = self._generate_recommendation(
            overall_score,
            quality_level,
            metrics
        )

        # Generate buy reason
        buy_reason = self._generate_buy_reason(strengths, metrics)

        # Determine risk level
        risk_level = health_result['risk_level']

        return FundamentalSignal(
            symbol=symbol,
            overall_score=overall_score,
            quality_level=quality_level,
            recommendation=recommendation,
            buy_reason=buy_reason,
            health_score=health_score,
            growth_score=growth_score,
            profitability_score=profitability_score,
            leverage_score=leverage_score,
            valuation_score=valuation_score,
            metrics=metrics,
            strengths=strengths,
            weaknesses=weaknesses,
            catalysts=catalysts,
            risk_level=risk_level,
            risk_factors=risk_factors,
            timestamp=datetime.now()
        )

    def _extract_metrics(self, symbol: str, info: Dict[str, Any]) -> FundamentalMetrics:
        """Extract all relevant metrics from ticker info"""
        current_price = info.get('currentPrice') or info.get('regularMarketPrice')
        week_52_high = info.get('fiftyTwoWeekHigh')
        week_52_low = info.get('fiftyTwoWeekLow')

        # Calculate 52-week position
        percent_from_52w_high = None
        percent_from_52w_low = None
        if current_price and week_52_high:
            percent_from_52w_high = ((current_price - week_52_high) / week_52_high) * 100
        if current_price and week_52_low:
            percent_from_52w_low = ((current_price - week_52_low) / week_52_low) * 100

        # Analyst recommendation mapping
        rec_mean = info.get('recommendationMean')
        analyst_rating = None
        if rec_mean:
            if rec_mean <= 2.0:
                analyst_rating = 'buy'
            elif rec_mean <= 3.0:
                analyst_rating = 'hold'
            else:
                analyst_rating = 'sell'

        # Calculate target upside
        target_price = info.get('targetMeanPrice')
        target_upside_pct = None
        if current_price and target_price:
            target_upside_pct = ((target_price - current_price) / current_price) * 100

        # Price to FCF
        price_to_fcf = None
        fcf = info.get('freeCashflow')
        market_cap = info.get('marketCap')
        if fcf and market_cap and fcf > 0:
            price_to_fcf = market_cap / fcf

        return FundamentalMetrics(
            # Valuation
            pe_ratio=info.get('trailingPE'),
            forward_pe=info.get('forwardPE'),
            peg_ratio=info.get('pegRatio'),
            ps_ratio=info.get('priceToSalesTrailing12Months'),
            pb_ratio=info.get('priceToBook'),
            price_to_fcf=price_to_fcf,

            # Growth
            revenue_growth=info.get('revenueGrowth'),
            earnings_growth=info.get('earningsGrowth'),
            revenue_per_share_growth=info.get('revenuePerShareGrowth'),

            # Profitability
            profit_margin=info.get('profitMargins'),
            operating_margin=info.get('operatingMargins'),
            roe=info.get('returnOnEquity'),
            roa=info.get('returnOnAssets'),
            roic=info.get('returnOnCapital'),

            # Financial health
            debt_to_equity=info.get('debtToEquity'),
            current_ratio=info.get('currentRatio'),
            quick_ratio=info.get('quickRatio'),
            free_cash_flow=info.get('freeCashflow'),
            operating_cash_flow=info.get('operatingCashflow'),

            # Price context
            current_price=current_price,
            week_52_high=week_52_high,
            week_52_low=week_52_low,
            percent_from_52w_high=percent_from_52w_high,
            percent_from_52w_low=percent_from_52w_low,

            # Analyst data
            analyst_rating=analyst_rating,
            target_price=target_price,
            target_upside_pct=target_upside_pct,
            num_analysts=info.get('numberOfAnalystOpinions'),
            recommendation_mean=rec_mean,

            # Market data
            market_cap=market_cap,
            sector=info.get('sector'),
            industry=info.get('industry'),
            avg_volume=info.get('averageVolume'),
        )

    def _score_growth(self, metrics: FundamentalMetrics) -> float:
        """Score growth metrics (0.0 to 1.0)"""
        score = 0.0
        max_score = 0.0

        # Revenue growth (50%)
        if metrics.revenue_growth is not None:
            max_score += 0.5
            if metrics.revenue_growth > 0.25:  # 25%+
                score += 0.5
            elif metrics.revenue_growth > 0.15:  # 15-25%
                score += 0.4
            elif metrics.revenue_growth > 0.10:  # 10-15%
                score += 0.3
            elif metrics.revenue_growth > 0.05:  # 5-10%
                score += 0.2
            elif metrics.revenue_growth > 0:  # Positive
                score += 0.1

        # Earnings growth (50%)
        if metrics.earnings_growth is not None:
            max_score += 0.5
            if metrics.earnings_growth > 0.25:
                score += 0.5
            elif metrics.earnings_growth > 0.15:
                score += 0.4
            elif metrics.earnings_growth > 0.10:
                score += 0.3
            elif metrics.earnings_growth > 0.05:
                score += 0.2
            elif metrics.earnings_growth > 0:
                score += 0.1

        if max_score > 0:
            return score / max_score
        return 0.5  # Neutral if no data

    def _score_profitability(self, metrics: FundamentalMetrics) -> float:
        """Score profitability metrics (0.0 to 1.0)"""
        score = 0.0
        max_score = 0.0

        # Profit margin (40%)
        if metrics.profit_margin is not None:
            max_score += 0.4
            if metrics.profit_margin > 0.20:  # 20%+
                score += 0.4
            elif metrics.profit_margin > 0.15:
                score += 0.3
            elif metrics.profit_margin > 0.10:
                score += 0.25
            elif metrics.profit_margin > 0.05:
                score += 0.15
            elif metrics.profit_margin > 0:
                score += 0.05

        # ROE (40%)
        if metrics.roe is not None:
            max_score += 0.4
            if metrics.roe > 0.20:  # 20%+
                score += 0.4
            elif metrics.roe > 0.15:
                score += 0.3
            elif metrics.roe > 0.10:
                score += 0.2
            elif metrics.roe > 0.05:
                score += 0.1

        # Operating margin (20%)
        if metrics.operating_margin is not None:
            max_score += 0.2
            if metrics.operating_margin > 0.20:
                score += 0.2
            elif metrics.operating_margin > 0.15:
                score += 0.15
            elif metrics.operating_margin > 0.10:
                score += 0.1
            elif metrics.operating_margin > 0:
                score += 0.05

        if max_score > 0:
            return score / max_score
        return 0.5

    def _score_leverage(self, metrics: FundamentalMetrics) -> float:
        """Score leverage/debt metrics (0.0 to 1.0) - lower debt is better"""
        if metrics.debt_to_equity is None:
            return 0.5

        if metrics.debt_to_equity < 30:
            return 1.0
        elif metrics.debt_to_equity < 50:
            return 0.9
        elif metrics.debt_to_equity < 75:
            return 0.7
        elif metrics.debt_to_equity < 100:
            return 0.5
        elif metrics.debt_to_equity < 150:
            return 0.3
        else:
            return 0.1

    def _score_valuation(self, metrics: FundamentalMetrics) -> float:
        """Score valuation metrics (0.0 to 1.0) - lower is better (relatively)"""
        score = 0.0
        max_score = 0.0

        # P/E ratio (40%)
        if metrics.pe_ratio is not None and metrics.pe_ratio > 0:
            max_score += 0.4
            if metrics.pe_ratio < 15:
                score += 0.4
            elif metrics.pe_ratio < 20:
                score += 0.3
            elif metrics.pe_ratio < 25:
                score += 0.2
            elif metrics.pe_ratio < 30:
                score += 0.1

        # PEG ratio (30%)
        if metrics.peg_ratio is not None and metrics.peg_ratio > 0:
            max_score += 0.3
            if metrics.peg_ratio < 1.0:
                score += 0.3
            elif metrics.peg_ratio < 1.5:
                score += 0.2
            elif metrics.peg_ratio < 2.0:
                score += 0.1

        # P/S ratio (15%)
        if metrics.ps_ratio is not None and metrics.ps_ratio > 0:
            max_score += 0.15
            if metrics.ps_ratio < 2:
                score += 0.15
            elif metrics.ps_ratio < 4:
                score += 0.1
            elif metrics.ps_ratio < 6:
                score += 0.05

        # P/B ratio (15%)
        if metrics.pb_ratio is not None and metrics.pb_ratio > 0:
            max_score += 0.15
            if metrics.pb_ratio < 2:
                score += 0.15
            elif metrics.pb_ratio < 3:
                score += 0.1
            elif metrics.pb_ratio < 5:
                score += 0.05

        if max_score > 0:
            return score / max_score
        return 0.5

    def _calculate_overall_score(
        self,
        health_score: float,
        growth_score: float,
        profitability_score: float,
        leverage_score: float,
        valuation_score: float
    ) -> int:
        """Calculate weighted overall score (0-100)"""
        # Weighted average
        weights = {
            'health': 0.25,      # 25% - Financial health
            'growth': 0.20,      # 20% - Growth potential
            'profitability': 0.25,  # 25% - Profitability
            'leverage': 0.15,    # 15% - Debt management
            'valuation': 0.15    # 15% - Price attractiveness
        }

        weighted_sum = (
            health_score * weights['health'] +
            growth_score * weights['growth'] +
            profitability_score * weights['profitability'] +
            leverage_score * weights['leverage'] +
            valuation_score * weights['valuation']
        )

        return int(weighted_sum * 100)

    def _determine_quality_level(self, overall_score: int) -> str:
        """Determine quality tier based on overall score"""
        if overall_score >= 80:
            return 'excellent'
        elif overall_score >= 65:
            return 'good'
        elif overall_score >= 50:
            return 'fair'
        else:
            return 'poor'

    def _identify_strengths(
        self,
        metrics: FundamentalMetrics,
        health_result: Dict[str, Any]
    ) -> List[str]:
        """Identify key strengths"""
        strengths = []

        # Growth strengths
        if metrics.revenue_growth and metrics.revenue_growth > 0.15:
            strengths.append(f"Strong revenue growth of {metrics.revenue_growth*100:.1f}%")
        if metrics.earnings_growth and metrics.earnings_growth > 0.15:
            strengths.append(f"Impressive earnings growth of {metrics.earnings_growth*100:.1f}%")

        # Profitability strengths
        if metrics.profit_margin and metrics.profit_margin > 0.15:
            strengths.append(f"Excellent profit margins of {metrics.profit_margin*100:.1f}%")
        if metrics.roe and metrics.roe > 0.20:
            strengths.append(f"Superior ROE of {metrics.roe*100:.1f}%")

        # Financial health
        if metrics.debt_to_equity and metrics.debt_to_equity < 50:
            strengths.append(f"Conservative debt level (D/E: {metrics.debt_to_equity:.1f})")
        if metrics.free_cash_flow and metrics.free_cash_flow > 0:
            fcf_b = metrics.free_cash_flow / 1e9
            strengths.append(f"Strong free cash flow of ${fcf_b:.2f}B")

        # Valuation
        if metrics.peg_ratio and metrics.peg_ratio < 1.0:
            strengths.append(f"Attractive PEG ratio of {metrics.peg_ratio:.2f}")
        if metrics.pe_ratio and metrics.pe_ratio < 15:
            strengths.append(f"Undervalued P/E of {metrics.pe_ratio:.1f}")

        # Analyst sentiment
        if metrics.target_upside_pct and metrics.target_upside_pct > 15:
            strengths.append(f"Analyst target implies {metrics.target_upside_pct:.1f}% upside")

        # 52-week position
        if metrics.percent_from_52w_high and metrics.percent_from_52w_high < -20:
            strengths.append(f"Trading {abs(metrics.percent_from_52w_high):.1f}% below 52-week high")

        return strengths[:5]  # Return top 5

    def _identify_weaknesses(
        self,
        metrics: FundamentalMetrics,
        health_result: Dict[str, Any]
    ) -> List[str]:
        """Identify key weaknesses"""
        weaknesses = []

        # Growth concerns
        if metrics.revenue_growth and metrics.revenue_growth < 0:
            weaknesses.append(f"Declining revenue ({metrics.revenue_growth*100:.1f}%)")

        # Profitability concerns
        if metrics.profit_margin and metrics.profit_margin < 0.05:
            weaknesses.append(f"Thin profit margins ({metrics.profit_margin*100:.1f}%)")
        if metrics.roe and metrics.roe < 0.05:
            weaknesses.append(f"Low return on equity ({metrics.roe*100:.1f}%)")

        # Debt concerns
        if metrics.debt_to_equity and metrics.debt_to_equity > 150:
            weaknesses.append(f"High debt burden (D/E: {metrics.debt_to_equity:.1f})")

        # Valuation concerns
        if metrics.pe_ratio and metrics.pe_ratio > 40:
            weaknesses.append(f"Rich valuation (P/E: {metrics.pe_ratio:.1f})")
        if metrics.peg_ratio and metrics.peg_ratio > 2.5:
            weaknesses.append(f"High PEG ratio of {metrics.peg_ratio:.2f}")

        # Liquidity concerns
        if metrics.current_ratio and metrics.current_ratio < 1.0:
            weaknesses.append(f"Low liquidity (Current ratio: {metrics.current_ratio:.2f})")

        return weaknesses[:5]  # Return top 5

    def _identify_catalysts(self, info: Dict[str, Any]) -> List[str]:
        """Identify upcoming catalysts"""
        catalysts = []

        # Check for earnings date
        # Note: yfinance doesn't always have next earnings date in info
        # This would need to be enhanced with calendar data

        return catalysts

    def _identify_risk_factors(
        self,
        metrics: FundamentalMetrics,
        health_result: Dict[str, Any]
    ) -> List[str]:
        """Identify specific risk factors"""
        risks = []

        if health_result['risk_level'] == 'high':
            risks.append("Poor financial health may limit downside protection")

        if metrics.debt_to_equity and metrics.debt_to_equity > 200:
            risks.append("High debt levels increase financial risk")

        if metrics.current_ratio and metrics.current_ratio < 1.0:
            risks.append("Low liquidity could pose short-term challenges")

        if metrics.pe_ratio and metrics.pe_ratio > 50:
            risks.append("High valuation leaves little room for error")

        if metrics.revenue_growth and metrics.revenue_growth < 0:
            risks.append("Declining revenue indicates business headwinds")

        return risks

    def _generate_recommendation(
        self,
        overall_score: int,
        quality_level: str,
        metrics: FundamentalMetrics
    ) -> str:
        """Generate investment recommendation"""
        if quality_level == 'excellent':
            return "STRONG BUY - High quality company with excellent fundamentals"
        elif quality_level == 'good':
            if metrics.target_upside_pct and metrics.target_upside_pct > 20:
                return "BUY - Good fundamentals with attractive upside potential"
            else:
                return "BUY - Solid fundamentals, accumulate on dips"
        elif quality_level == 'fair':
            return "HOLD/BUY - Moderate fundamentals, suitable for selective positioning"
        else:
            return "WATCH - Weak fundamentals, monitor for improvement"

    def _generate_buy_reason(
        self,
        strengths: List[str],
        metrics: FundamentalMetrics
    ) -> str:
        """Generate primary buy reason"""
        if not strengths:
            return "Stock shows potential based on fundamental analysis"

        # Prioritize the most compelling strength
        top_strength = strengths[0]

        # Create contextual buy reason
        if "revenue growth" in top_strength.lower():
            return f"Strong growth momentum: {top_strength}"
        elif "profit margin" in top_strength.lower():
            return f"High profitability: {top_strength}"
        elif "roe" in top_strength.lower():
            return f"Excellent capital efficiency: {top_strength}"
        elif "cash flow" in top_strength.lower():
            return f"Strong cash generation: {top_strength}"
        elif "peg" in top_strength.lower() or "p/e" in top_strength.lower():
            return f"Attractive valuation: {top_strength}"
        elif "upside" in top_strength.lower():
            return f"Analyst support: {top_strength}"
        else:
            return top_strength

    def _meets_quality_filters(self, info: Dict[str, Any]) -> bool:
        """
        Check if stock meets minimum quality requirements.

        Quality filters prevent:
        - Penny stocks / micro-caps (manipulation risk)
        - Illiquid stocks (hard to exit)
        - Stocks with insufficient data (unreliable analysis)
        """
        # Filter 1: Market cap minimum ($1B+)
        market_cap = info.get('marketCap')
        if not market_cap or market_cap < self.MIN_MARKET_CAP:
            return False

        # Filter 2: Volume minimum (500K+ shares/day)
        avg_volume = info.get('averageVolume')
        if not avg_volume or avg_volume < self.MIN_AVG_VOLUME:
            return False

        # Filter 3: Data completeness check
        data_completeness = self._calculate_data_completeness(info)
        if data_completeness < self.MIN_DATA_COMPLETENESS:
            return False

        return True

    def _calculate_data_completeness(self, info: Dict[str, Any]) -> float:
        """
        Calculate what percentage of key metrics are available.

        Returns: 0.0 to 1.0 representing data completeness
        """
        key_metrics = [
            'currentPrice',
            'marketCap',
            'trailingPE',
            'forwardPE',
            'priceToBook',
            'profitMargins',
            'revenueGrowth',
            'debtToEquity',
            'returnOnEquity',
            'freeCashflow',
            'operatingCashflow',
            'currentRatio',
            'fiftyTwoWeekHigh',
            'fiftyTwoWeekLow',
        ]

        available = sum(1 for metric in key_metrics if info.get(metric) is not None)
        return available / len(key_metrics)

    def _validate_against_analysts(
        self,
        overall_score: int,
        metrics: FundamentalMetrics
    ) -> List[str]:
        """
        Validate our score against analyst consensus.

        Returns: List of validation warnings (empty if aligned)
        """
        warnings = []

        if not metrics.recommendation_mean:
            return warnings  # No analyst data to validate against

        # Check for major disagreement
        # Analyst scale: 1.0=Strong Buy, 2.0=Buy, 3.0=Hold, 4.0=Sell, 5.0=Strong Sell
        # Our score: 80+=Excellent, 65+=Good, 50+=Fair, <50=Poor

        if overall_score >= 80 and metrics.recommendation_mean >= 4.0:
            warnings.append(
                f"WARNING: Our score is Excellent but analysts rate this 'Sell' (avg: {metrics.recommendation_mean:.1f})"
            )
        elif overall_score >= 65 and metrics.recommendation_mean >= 4.5:
            warnings.append(
                f"CAUTION: Our score is Good but analysts are very bearish (avg: {metrics.recommendation_mean:.1f})"
            )
        elif overall_score < 50 and metrics.recommendation_mean <= 2.0:
            warnings.append(
                f"NOTE: Our score is low but analysts are bullish (avg: {metrics.recommendation_mean:.1f}) - potential value trap or recovery play"
            )

        # Check if very few analysts cover (less institutional attention)
        if metrics.num_analysts and metrics.num_analysts < 3:
            warnings.append(
                f"Limited analyst coverage ({metrics.num_analysts} analysts) - less institutional validation"
            )

        return warnings

    def _check_value_trap_indicators(self, metrics: FundamentalMetrics) -> List[str]:
        """
        Check for value trap indicators (cheap but deteriorating).

        Returns: List of value trap warnings
        """
        warnings = []

        # Value trap pattern: Low valuation + declining fundamentals
        is_cheap = metrics.pe_ratio and metrics.pe_ratio < 12

        if is_cheap:
            # Check for deterioration
            if metrics.revenue_growth and metrics.revenue_growth < -0.05:
                warnings.append("Value trap risk: Cheap valuation but revenue declining >5%")

            if metrics.profit_margin and metrics.profit_margin < 0:
                warnings.append("Value trap risk: Unprofitable despite low valuation")

            if metrics.debt_to_equity and metrics.debt_to_equity > 200:
                warnings.append("Value trap risk: High debt burden despite cheap valuation")

        return warnings

    def _check_growth_trap_indicators(self, metrics: FundamentalMetrics) -> List[str]:
        """
        Check for growth trap indicators (high growth but unsustainable).

        Returns: List of growth trap warnings
        """
        warnings = []

        # Growth trap pattern: High valuation + negative cash flow
        is_expensive = (
            (metrics.pe_ratio and metrics.pe_ratio > 40) or
            (metrics.peg_ratio and metrics.peg_ratio > 3.0)
        )

        if is_expensive:
            # Check for sustainability issues
            if metrics.free_cash_flow and metrics.free_cash_flow < 0:
                warnings.append("Growth trap risk: High valuation but burning cash")

            if metrics.profit_margin and metrics.profit_margin < 0.05:
                warnings.append("Growth trap risk: Expensive valuation with thin/negative margins")

            if metrics.debt_to_equity and metrics.debt_to_equity > 150:
                warnings.append("Growth trap risk: High valuation paired with high debt")

        return warnings
