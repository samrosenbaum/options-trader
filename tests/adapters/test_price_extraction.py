"""Tests for enhanced price extraction with timestamp tracking."""

from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, MagicMock
import pandas as pd
import pytest

from src.adapters.yfinance import YFinanceOptionsDataAdapter, PriceInfo


class TestPriceExtraction:
    """Test suite for price extraction with metadata tracking."""

    def test_extract_price_from_fast_info(self):
        """Test price extraction from fast_info (highest priority)."""
        # Setup
        adapter = YFinanceOptionsDataAdapter()
        ticker = Mock()

        # Mock fast_info with a valid price
        fast_info = {"last_price": 150.25}
        ticker.fast_info = fast_info

        # Execute
        price_info = adapter._extract_price(ticker)

        # Assert
        assert price_info is not None
        assert price_info.price == 150.25
        assert "fast_info" in price_info.source
        assert price_info.age_seconds == 0.0  # Should be essentially real-time
        assert isinstance(price_info.timestamp, datetime)

    def test_extract_price_from_intraday_history(self):
        """Test price extraction from intraday history (fallback)."""
        # Setup
        adapter = YFinanceOptionsDataAdapter()
        ticker = Mock()

        # Mock fast_info returning None
        ticker.fast_info = {}

        # Mock intraday history
        now = datetime.now(timezone.utc)
        five_min_ago = now - timedelta(minutes=5)

        history_data = pd.DataFrame({
            'Close': [152.50, 152.75, 153.00]
        }, index=pd.DatetimeIndex([
            five_min_ago - timedelta(minutes=2),
            five_min_ago - timedelta(minutes=1),
            five_min_ago
        ], tz='America/New_York'))

        ticker.history = Mock(return_value=history_data)

        # Execute
        price_info = adapter._extract_price(ticker)

        # Assert
        assert price_info is not None
        assert price_info.price == 153.00
        assert "intraday" in price_info.source
        assert price_info.age_seconds < 900  # Less than 15 minutes
        assert price_info.age_seconds > 0

    def test_extract_price_rejects_stale_intraday(self):
        """Test that intraday prices older than 15 min are rejected."""
        # Setup
        adapter = YFinanceOptionsDataAdapter()
        ticker = Mock()

        # Mock fast_info returning None
        ticker.fast_info = {}

        # Mock stale intraday history (20 minutes old)
        now = datetime.now(timezone.utc)
        twenty_min_ago = now - timedelta(minutes=20)

        history_data = pd.DataFrame({
            'Close': [152.50]
        }, index=pd.DatetimeIndex([twenty_min_ago], tz='America/New_York'))

        ticker.history = Mock(return_value=history_data)

        # Mock info dict with currentPrice as final fallback
        info_dict = {"currentPrice": 151.00, "marketState": "REGULAR"}
        ticker.info = info_dict

        # Execute
        price_info = adapter._extract_price(ticker)

        # Assert - should use info dict instead of stale history
        assert price_info is not None
        assert price_info.price == 151.00
        assert "info" in price_info.source

    def test_extract_price_from_info_dict(self):
        """Test price extraction from info dict."""
        # Setup
        adapter = YFinanceOptionsDataAdapter()
        ticker = Mock()

        # Mock fast_info and history returning None/empty
        ticker.fast_info = {}
        ticker.history = Mock(return_value=pd.DataFrame())

        # Mock info dict
        info_dict = {
            "currentPrice": 148.75,
            "marketState": "REGULAR",
            "regularMarketTime": datetime.now(timezone.utc).timestamp()
        }
        ticker.info = info_dict

        # Execute
        price_info = adapter._extract_price(ticker)

        # Assert
        assert price_info is not None
        assert price_info.price == 148.75
        assert "info" in price_info.source
        assert "REGULAR" in price_info.source

    def test_extract_price_flags_previous_close(self):
        """Test that previousClose is flagged as STALE."""
        # Setup
        adapter = YFinanceOptionsDataAdapter()
        ticker = Mock()

        # Mock all higher priority sources failing
        ticker.fast_info = {}
        ticker.history = Mock(return_value=pd.DataFrame())

        # Mock info dict with only previousClose
        info_dict = {"previousClose": 145.50}
        ticker.info = info_dict

        # Execute
        price_info = adapter._extract_price(ticker)

        # Assert
        assert price_info is not None
        assert price_info.price == 145.50
        assert "STALE" in price_info.source
        assert "previousClose" in price_info.source
        assert price_info.age_seconds > 3600  # More than 1 hour old

    def test_extract_price_returns_none_when_no_data(self):
        """Test that None is returned when no price data is available."""
        # Setup
        adapter = YFinanceOptionsDataAdapter()
        ticker = Mock()

        # Mock all sources failing
        ticker.fast_info = {}
        ticker.history = Mock(return_value=pd.DataFrame())
        ticker.info = {}

        # Execute
        price_info = adapter._extract_price(ticker)

        # Assert
        assert price_info is None

    def test_is_valid_price_rejects_invalid_values(self):
        """Test that invalid price values are rejected."""
        adapter = YFinanceOptionsDataAdapter()

        # Test various invalid values
        assert adapter._is_valid_price(None) is False
        assert adapter._is_valid_price(0) is False
        assert adapter._is_valid_price("") is False
        assert adapter._is_valid_price(-10.5) is False
        assert adapter._is_valid_price(float('inf')) is False
        assert adapter._is_valid_price(float('nan')) is False

    def test_is_valid_price_accepts_valid_values(self):
        """Test that valid price values are accepted."""
        adapter = YFinanceOptionsDataAdapter()

        assert adapter._is_valid_price(100.50) is True
        assert adapter._is_valid_price(0.01) is True
        assert adapter._is_valid_price("150.25") is True
        assert adapter._is_valid_price(1000000) is True

    def test_price_info_namedtuple_structure(self):
        """Test PriceInfo namedtuple has correct fields."""
        now = datetime.now(timezone.utc)

        price_info = PriceInfo(
            price=150.00,
            timestamp=now,
            source="test_source",
            age_seconds=10.5
        )

        assert price_info.price == 150.00
        assert price_info.timestamp == now
        assert price_info.source == "test_source"
        assert price_info.age_seconds == 10.5

    def test_get_chain_includes_price_metadata(self):
        """Test that get_chain method includes price metadata in OptionsChain."""
        from datetime import date

        # Setup
        adapter = YFinanceOptionsDataAdapter()
        ticker = Mock()

        # Mock option chain data
        calls_df = pd.DataFrame({
            'strike': [100, 105, 110],
            'lastPrice': [5.0, 3.0, 1.5],
            'bid': [4.9, 2.9, 1.4],
            'ask': [5.1, 3.1, 1.6],
        })
        puts_df = pd.DataFrame({
            'strike': [100, 95, 90],
            'lastPrice': [4.0, 6.0, 8.5],
            'bid': [3.9, 5.9, 8.4],
            'ask': [4.1, 6.1, 8.6],
        })

        option_chain = Mock()
        option_chain.calls = calls_df
        option_chain.puts = puts_df

        ticker.option_chain = Mock(return_value=option_chain)

        # Mock fast_info for price extraction
        ticker.fast_info = {"last_price": 100.00}

        ticker.options = ['2025-12-19']

        # Execute
        expiration = date(2025, 12, 19)
        chain = adapter.get_chain('AAPL', expiration)

        # Assert
        assert chain.symbol == 'AAPL'
        assert chain.underlying_price == 100.00
        assert chain.price_timestamp is not None
        assert chain.price_source is not None
        assert "fast_info" in chain.price_source

    def test_chain_to_dataframe_includes_metadata_columns(self):
        """Test that OptionsChain.to_dataframe includes metadata columns."""
        from datetime import date
        from src.adapters.base import OptionsChain

        now = datetime.now(timezone.utc)

        calls_df = pd.DataFrame({
            'strike': [100],
            'lastPrice': [5.0],
            'bid': [4.9],
            'ask': [5.1],
        })

        chain = OptionsChain(
            symbol='TEST',
            expiration=date(2025, 12, 19),
            calls=calls_df,
            puts=pd.DataFrame(),
            underlying_price=100.00,
            price_timestamp=now,
            price_source='test_source'
        )

        df = chain.to_dataframe()

        # Assert metadata columns are present
        assert '_price_timestamp' in df.columns
        assert '_price_source' in df.columns
        assert '_price_age_seconds' in df.columns

        # Assert values are correct
        assert df['_price_source'].iloc[0] == 'test_source'
        assert df['_price_timestamp'].iloc[0] == now.isoformat()
        assert df['_price_age_seconds'].iloc[0] >= 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
