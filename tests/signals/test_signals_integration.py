"""Integration tests for directional signals."""

import pandas as pd
import pytest

from src.signals import (
    Direction,
    OptionsSkewAnalyzer,
    SignalAggregator,
    SmartMoneyFlowDetector,
)


class TestOptionsSkewAnalyzer:
    """Test Options Skew signal."""

    def test_bullish_call_skew(self):
        """Test detection of bullish call skew."""
        analyzer = OptionsSkewAnalyzer()

        # Create mock options chain with call skew (calls more expensive)
        options_chain = pd.DataFrame(
            {
                "type": ["call", "call", "call", "put", "put", "put"],
                "strike": [105, 110, 115, 95, 90, 85],
                "impliedVolatility": [0.45, 0.50, 0.55, 0.35, 0.33, 0.32],  # Calls have higher IV
                "volume": [100, 150, 80, 90, 70, 60],
                "openInterest": [1000, 1500, 800, 900, 700, 600],
            }
        )

        data = {"options_chain": options_chain, "stock_price": 100.0, "atm_iv": 0.40}

        result = analyzer.calculate(data)

        assert result.direction == Direction.BULLISH
        assert result.score > 0
        assert result.confidence > 50
        assert "call skew" in result.rationale.lower() or "bullish" in result.rationale.lower()

    def test_bearish_put_skew(self):
        """Test detection of bearish put skew."""
        analyzer = OptionsSkewAnalyzer()

        # Create mock options chain with put skew (puts more expensive)
        options_chain = pd.DataFrame(
            {
                "type": ["call", "call", "call", "put", "put", "put"],
                "strike": [105, 110, 115, 95, 90, 85],
                "impliedVolatility": [0.32, 0.33, 0.35, 0.50, 0.52, 0.55],  # Puts have higher IV
                "volume": [90, 70, 60, 120, 140, 100],
                "openInterest": [900, 700, 600, 1200, 1400, 1000],
            }
        )

        data = {"options_chain": options_chain, "stock_price": 100.0, "atm_iv": 0.40}

        result = analyzer.calculate(data)

        assert result.direction == Direction.BEARISH
        assert result.score < 0
        assert result.confidence > 50
        assert "put skew" in result.rationale.lower() or "bearish" in result.rationale.lower()

    def test_neutral_flat_skew(self):
        """Test detection of neutral/flat skew."""
        analyzer = OptionsSkewAnalyzer()

        # Create mock options chain with flat skew (similar IVs)
        options_chain = pd.DataFrame(
            {
                "type": ["call", "call", "call", "put", "put", "put"],
                "strike": [105, 110, 115, 95, 90, 85],
                "impliedVolatility": [0.41, 0.42, 0.43, 0.41, 0.42, 0.43],  # Flat skew
                "volume": [100, 100, 100, 100, 100, 100],
                "openInterest": [1000, 1000, 1000, 1000, 1000, 1000],
            }
        )

        data = {"options_chain": options_chain, "stock_price": 100.0, "atm_iv": 0.40}

        result = analyzer.calculate(data)

        assert result.direction == Direction.NEUTRAL
        assert abs(result.score) < 20
        assert "flat skew" in result.rationale.lower() or "neutral" in result.rationale.lower()


class TestSmartMoneyFlowDetector:
    """Test Smart Money Flow signal."""

    def test_bullish_call_flow(self):
        """Test detection of bullish call buying flow."""
        detector = SmartMoneyFlowDetector()

        # Create mock options data with heavy call buying
        options_data = pd.DataFrame(
            {
                "type": ["call", "call", "call", "put", "put"],
                "strike": [105, 110, 115, 95, 90],
                "volume": [5000, 8000, 3000, 500, 300],  # Heavy call volume
                "openInterest": [2000, 3000, 1500, 1000, 800],
                "lastPrice": [5.2, 3.1, 1.5, 0.5, 0.3],
                "bid": [5.0, 3.0, 1.4, 0.4, 0.25],
                "ask": [5.4, 3.2, 1.6, 0.6, 0.35],
            }
        )

        historical_volume = {
            "avg_call_volume": 2000,
            "avg_put_volume": 800,
            "call_volume_std": 600,
            "put_volume_std": 200,
        }

        data = {
            "options_data": options_data,
            "historical_volume": historical_volume,
            "stock_price": 100.0,
            "price_change": 2.5,  # Stock up
        }

        result = detector.calculate(data)

        assert result.direction == Direction.BULLISH
        assert result.score > 0
        assert result.confidence > 50
        assert "call" in result.rationale.lower() or "bullish" in result.rationale.lower()

    def test_bearish_put_flow(self):
        """Test detection of bearish put buying flow."""
        detector = SmartMoneyFlowDetector()

        # Create mock options data with heavy put buying
        options_data = pd.DataFrame(
            {
                "type": ["call", "call", "put", "put", "put"],
                "strike": [105, 110, 95, 90, 85],
                "volume": [500, 300, 6000, 7000, 4000],  # Heavy put volume
                "openInterest": [1000, 800, 2000, 2500, 1800],
                "lastPrice": [1.0, 0.5, 4.0, 5.5, 7.0],
                "bid": [0.9, 0.45, 3.8, 5.3, 6.8],
                "ask": [1.1, 0.55, 4.2, 5.7, 7.2],
            }
        )

        historical_volume = {
            "avg_call_volume": 800,
            "avg_put_volume": 2000,
            "call_volume_std": 200,
            "put_volume_std": 600,
        }

        data = {
            "options_data": options_data,
            "historical_volume": historical_volume,
            "stock_price": 100.0,
            "price_change": -3.0,  # Stock down
        }

        result = detector.calculate(data)

        assert result.direction == Direction.BEARISH
        assert result.score < 0
        assert result.confidence > 50
        assert "put" in result.rationale.lower() or "bearish" in result.rationale.lower()


class TestSignalAggregator:
    """Test signal aggregation."""

    def test_aggregation_bullish_consensus(self):
        """Test aggregation when both signals agree on bullish."""
        skew_analyzer = OptionsSkewAnalyzer(weight=0.5)
        flow_detector = SmartMoneyFlowDetector(weight=0.5)
        aggregator = SignalAggregator([skew_analyzer, flow_detector])

        # Bullish options chain
        options_chain = pd.DataFrame(
            {
                "type": ["call"] * 5 + ["put"] * 5,
                "strike": [105, 110, 115, 120, 125, 95, 90, 85, 80, 75],
                "impliedVolatility": [0.50] * 5 + [0.35] * 5,  # Call skew
                "volume": [1000, 1500, 1200, 800, 600, 200, 150, 100, 80, 50],
                "openInterest": [2000, 3000, 2400, 1600, 1200, 400, 300, 200, 160, 100],
                "lastPrice": [5.0, 3.0, 1.5, 0.8, 0.4, 0.3, 0.2, 0.15, 0.1, 0.05],
                "bid": [4.8, 2.9, 1.4, 0.75, 0.35, 0.25, 0.15, 0.12, 0.08, 0.04],
                "ask": [5.2, 3.1, 1.6, 0.85, 0.45, 0.35, 0.25, 0.18, 0.12, 0.06],
            }
        )

        data = {
            "options_chain": options_chain,
            "options_data": options_chain,
            "stock_price": 100.0,
            "atm_iv": 0.40,
            "historical_volume": {"avg_call_volume": 1000, "avg_put_volume": 400},
            "price_change": 2.0,
        }

        result = aggregator.aggregate("TEST", data)

        assert result.direction == Direction.BULLISH
        assert result.score > 0
        assert result.confidence > 60  # Should be high confidence when signals agree
        assert len(result.signals) == 2

    def test_aggregation_bearish_consensus(self):
        """Test aggregation when both signals agree on bearish."""
        skew_analyzer = OptionsSkewAnalyzer(weight=0.5)
        flow_detector = SmartMoneyFlowDetector(weight=0.5)
        aggregator = SignalAggregator([skew_analyzer, flow_detector])

        # Bearish options chain
        options_chain = pd.DataFrame(
            {
                "type": ["call"] * 5 + ["put"] * 5,
                "strike": [105, 110, 115, 120, 125, 95, 90, 85, 80, 75],
                "impliedVolatility": [0.35] * 5 + [0.50] * 5,  # Put skew
                "volume": [200, 150, 100, 80, 50, 1000, 1500, 1200, 800, 600],
                "openInterest": [400, 300, 200, 160, 100, 2000, 3000, 2400, 1600, 1200],
                "lastPrice": [0.3, 0.2, 0.15, 0.1, 0.05, 5.0, 6.5, 8.0, 10.0, 12.0],
                "bid": [0.25, 0.15, 0.12, 0.08, 0.04, 4.8, 6.3, 7.8, 9.8, 11.8],
                "ask": [0.35, 0.25, 0.18, 0.12, 0.06, 5.2, 6.7, 8.2, 10.2, 12.2],
            }
        )

        data = {
            "options_chain": options_chain,
            "options_data": options_chain,
            "stock_price": 100.0,
            "atm_iv": 0.40,
            "historical_volume": {"avg_call_volume": 400, "avg_put_volume": 1000},
            "price_change": -2.5,
        }

        result = aggregator.aggregate("TEST", data)

        assert result.direction == Direction.BEARISH
        assert result.score < 0
        assert result.confidence > 60
        assert len(result.signals) == 2

    def test_signal_breakdown(self):
        """Test that signal breakdown is generated correctly."""
        skew_analyzer = OptionsSkewAnalyzer(weight=0.6)
        flow_detector = SmartMoneyFlowDetector(weight=0.4)
        aggregator = SignalAggregator([skew_analyzer, flow_detector])

        options_chain = pd.DataFrame(
            {
                "type": ["call", "put"],
                "strike": [105, 95],
                "impliedVolatility": [0.45, 0.35],
                "volume": [1000, 500],
                "openInterest": [2000, 1000],
                "lastPrice": [5.0, 2.0],
                "bid": [4.8, 1.8],
                "ask": [5.2, 2.2],
            }
        )

        data = {
            "options_chain": options_chain,
            "options_data": options_chain,
            "stock_price": 100.0,
            "atm_iv": 0.40,
            "historical_volume": {"avg_call_volume": 800, "avg_put_volume": 600},
            "price_change": 1.0,
        }

        result = aggregator.aggregate("TEST", data)
        breakdown = aggregator.get_signal_breakdown(result)

        assert "overall" in breakdown
        assert "signals" in breakdown
        assert len(breakdown["signals"]) == 2
        assert breakdown["overall"]["symbol"] == "TEST"
        assert all(key in breakdown["signals"][0] for key in ["name", "weight", "direction", "score", "confidence"])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
