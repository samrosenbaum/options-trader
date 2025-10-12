#!/usr/bin/env python3
"""
Advanced Crypto Scanner - Find coins poised for explosive moves
Analyzes fundamentals, volume patterns, technical indicators, and market sentiment
"""

import requests
import json
import time
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union
import sys
import math
from pathlib import Path

# Ensure project root is on path for signal imports
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from src.signals import (  # type: ignore
    SignalAggregator,
    OptionsSkewAnalyzer,
    SmartMoneyFlowDetector,
    RegimeDetector,
    VolumeProfileAnalyzer,
    CryptoQuantSignal,
)

class CryptoScanner:
    def __init__(self):
        self.base_url = "https://api.coingecko.com/api/v3"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        
        # Top crypto symbols to analyze
        self.crypto_watchlist = [
            'bitcoin', 'ethereum', 'binancecoin', 'cardano', 'solana', 'polkadot',
            'chainlink', 'litecoin', 'avalanche-2', 'polygon', 'stellar', 'vechain',
            'filecoin', 'tron', 'monero', 'algorand', 'ethereum-classic', 'cosmos',
            'tezos', 'uniswap', 'aave', 'compound-governance-token', 'maker',
            'sushi', 'curve-dao-token', 'yearn-finance', 'synthetix-network-token',
            '0x', 'bancor', 'kyber-network-crystal', 'enjincoin', 'decentraland',
            'the-sandbox', 'axie-infinity', 'chiliz', 'flow', 'near', 'fantom',
            'harmony', 'elrond-erd-2', 'hedera-hashgraph', 'the-graph',
            'internet-computer', 'theta-token', 'basic-attention-token',
            'holo', 'siacoin', 'waves', 'zilliqa', 'ontology', 'icon',
            'qtum', 'neo', 'dash', 'zcash', 'bitcoin-cash', 'dogecoin',
            'shiba-inu', 'pepe', 'floki', 'bonk', 'bittensor', 'injective',
            'sei-network', 'sui', 'aptos', 'arbitrum', 'optimism', 'mantle'
        ]

        # Directional signal framework reused from equities
        self.signal_aggregator = SignalAggregator([
            OptionsSkewAnalyzer(weight=0.25),
            SmartMoneyFlowDetector(weight=0.25),
            RegimeDetector(weight=0.20),
            VolumeProfileAnalyzer(weight=0.15),
            CryptoQuantSignal(weight=0.15),
        ])

        # Empty options frame placeholder for non-derivative assets
        self._empty_options_frame = pd.DataFrame(
            columns=[
                'type',
                'strike',
                'impliedVolatility',
                'volume',
                'openInterest',
                'bid',
                'ask',
                'lastPrice',
            ]
        )

    def get_crypto_data(self, coin_id: str) -> Optional[Dict]:
        """Fetch comprehensive crypto data for a coin"""
        try:
            # Get basic market data
            url = f"{self.base_url}/coins/{coin_id}"
            params = {
                'localization': 'false',
                'tickers': 'false',
                'market_data': 'true',
                'community_data': 'true',
                'developer_data': 'true',
                'sparkline': 'true'
            }
            
            response = self.session.get(url, params=params, timeout=10)
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Error fetching data for {coin_id}: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"Error fetching data for {coin_id}: {e}")
            return None
    
    def get_price_history(
        self, coin_id: str, days: int = 30, *, return_raw: bool = False
    ) -> Optional[Union[List, Dict]]:
        """Get price history for technical analysis"""
        try:
            url = f"{self.base_url}/coins/{coin_id}/market_chart"
            params = {
                'vs_currency': 'usd',
                'days': days,
                'interval': 'daily' if days > 30 else 'hourly'
            }
            
            response = self.session.get(url, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if return_raw:
                    return data
                return data.get('prices', [])
            return None

        except Exception as e:
            print(f"Error fetching price history for {coin_id}: {e}")
            return None

    def _build_price_history_dataframe(self, market_chart: Optional[Dict]) -> pd.DataFrame:
        """Convert CoinGecko market chart data into OHLCV DataFrame."""
        if not market_chart:
            return pd.DataFrame()

        prices = market_chart.get('prices', []) if isinstance(market_chart, dict) else []
        if not prices:
            return pd.DataFrame()

        df = pd.DataFrame(prices, columns=['timestamp', 'close'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df['close'] = pd.to_numeric(df['close'], errors='coerce')
        df = df.dropna(subset=['close']).sort_values('timestamp').reset_index(drop=True)

        volumes = market_chart.get('total_volumes', []) if isinstance(market_chart, dict) else []
        if volumes:
            volume_df = pd.DataFrame(volumes, columns=['timestamp', 'volume'])
            volume_df['timestamp'] = pd.to_datetime(volume_df['timestamp'], unit='ms')
            df = df.merge(volume_df, on='timestamp', how='left')
        else:
            df['volume'] = np.nan

        df['volume'] = df['volume'].fillna(method='ffill').fillna(method='bfill').fillna(0.0)
        df['open'] = df['close'].shift(1).fillna(df['close'])
        df['high'] = df[['open', 'close']].max(axis=1)
        df['low'] = df[['open', 'close']].min(axis=1)

        return df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]

    def get_price_history_with_dataframe(
        self, coin_id: str, days: int = 30
    ) -> Tuple[List, pd.DataFrame]:
        """Fetch raw price history list alongside OHLCV DataFrame."""
        raw_data = self.get_price_history(coin_id, days=days, return_raw=True)
        if not raw_data:
            return [], pd.DataFrame()

        price_history = raw_data.get('prices', []) if isinstance(raw_data, dict) else []
        price_history_df = self._build_price_history_dataframe(raw_data if isinstance(raw_data, dict) else None)
        return price_history, price_history_df

    def fetch_news_sentiment(self, symbol: str) -> Dict:
        """Pull latest crypto headlines and derive a directional sentiment score."""

        default = {
            'sentiment_score': 0.0,
            'momentum_score': 0.0,
            'buzz_score': 0.0,
            'article_count': 0,
            'recent_count': 0,
            'positive': 0,
            'negative': 0,
            'neutral': 0,
            'top_headlines': [],
            'articles': [],
        }

        try:
            params = {
                'lang': 'EN',
                'categories': symbol.upper(),
                'excludeCategories': 'ICO',
                'sortOrder': 'latest',
            }
            response = self.session.get(
                'https://min-api.cryptocompare.com/data/v2/news/',
                params=params,
                timeout=10,
            )
            if response.status_code != 200:
                return default

            payload = response.json()
            articles = payload.get('Data', []) if isinstance(payload, dict) else []
            if not articles:
                return default

            positive_keywords = [
                'surge', 'rally', 'partnership', 'adoption', 'upgrade', 'integration',
                'support', 'institutional', 'bull', 'record', 'etf approval', 'launch'
            ]
            negative_keywords = [
                'hack', 'exploit', 'lawsuit', 'ban', 'sell-off', 'bear', 'crash', 'liquidation',
                'bankrupt', 'regulation', 'delist', 'security breach'
            ]

            now = datetime.utcnow()
            weighted_total = 0.0
            total_weight = 0.0
            recent_scores: List[float] = []
            older_scores: List[float] = []
            positive = negative = neutral = 0
            recent_count = 0
            top_headlines: List[str] = []
            processed_articles: List[Dict[str, Any]] = []

            for article in articles[:40]:
                title = str(article.get('title', '') or '').strip()
                body = str(article.get('body', '') or '')
                text = f"{title}. {body}".lower()

                base_score = 0
                for keyword in positive_keywords:
                    if keyword in text:
                        base_score += 1
                for keyword in negative_keywords:
                    if keyword in text:
                        base_score -= 1

                # Incorporate community reaction if available
                upvotes = float(article.get('upvotes', 0) or 0)
                downvotes = float(article.get('downvotes', 0) or 0)
                reaction = upvotes - downvotes
                base_score += math.tanh(reaction / 10.0)

                published_on = article.get('published_on') or article.get('published_at')
                try:
                    published_dt = datetime.utcfromtimestamp(published_on) if published_on else now
                except Exception:
                    published_dt = now

                hours_old = max((now - published_dt).total_seconds() / 3600.0, 0.0)
                recency_weight = max(0.2, 1.0 - min(hours_old, 72.0) / 72.0)
                buzz_weight = 1.0 + min((upvotes / 20.0), 1.5)
                weight = recency_weight * buzz_weight

                article_score = max(min(base_score, 3.0), -3.0)
                weighted_total += article_score * weight
                total_weight += weight

                if hours_old <= 12:
                    recent_scores.append(article_score)
                    recent_count += 1
                else:
                    older_scores.append(article_score)

                if article_score > 0.4:
                    positive += 1
                elif article_score < -0.4:
                    negative += 1
                else:
                    neutral += 1

                if title:
                    top_headlines.append(title)

                processed_articles.append({
                    'title': title,
                    'url': article.get('url'),
                    'source': article.get('source_info', {}).get('name') if isinstance(article.get('source_info'), dict) else None,
                    'published_at': published_dt.isoformat(),
                    'score': article_score,
                })

            sentiment_score = (weighted_total / total_weight) if total_weight else 0.0
            sentiment_score = float(np.clip(sentiment_score / 3.0, -1.0, 1.0))

            recent_avg = np.mean(recent_scores) if recent_scores else 0.0
            older_avg = np.mean(older_scores) if older_scores else 0.0
            momentum_score = float(np.clip((recent_avg - older_avg) / 3.0, -1.0, 1.0))

            article_count = len(processed_articles)
            buzz_score = 0.0
            if article_count:
                buzz_score = float(np.clip(((article_count / 12.0) + (recent_count / max(article_count, 1))) / 2.0, 0.0, 1.0))

            return {
                'sentiment_score': sentiment_score,
                'momentum_score': momentum_score,
                'buzz_score': buzz_score,
                'article_count': article_count,
                'recent_count': recent_count,
                'positive': positive,
                'negative': negative,
                'neutral': neutral,
                'top_headlines': top_headlines[:5],
                'articles': processed_articles,
            }

        except Exception as exc:
            print(f"Error fetching news sentiment for {symbol}: {exc}")
            return default

    def fetch_derivatives_metrics(self, coin_id: str, market_data: Dict) -> Dict:
        """Collect futures and perpetual positioning clues for the asset."""

        default = {
            'tickers_analyzed': 0,
            'avg_basis': 0.0,
            'basis_score': 0.0,
            'avg_funding_rate': 0.0,
            'funding_score': 0.0,
            'open_interest_score': 0.0,
            'open_interest_ratio': 0.0,
            'total_open_interest': 0.0,
            'total_volume': 0.0,
            'long_short_bias': 'balanced',
            'dominant_expiry': 'perpetual focus',
        }

        market_cap = float(market_data.get('market_cap', {}).get('usd', 0) or 0)

        try:
            params = {
                'include_exchange_logo': 'false',
                'exchange_ids': 'binance_futures,bybit,okex,deribit',
                'depth': 'false',
            }
            url = f"{self.base_url}/coins/{coin_id}/tickers"
            response = self.session.get(url, params=params, timeout=10)
            if response.status_code != 200:
                return default

            payload = response.json()
            tickers = payload.get('tickers', []) if isinstance(payload, dict) else []
            if not tickers:
                return default

            basis_values: List[float] = []
            funding_rates: List[float] = []
            open_interest_usd = 0.0
            total_volume = 0.0
            expiries: List[Tuple[datetime, float]] = []
            analyzed = 0
            long_bias_votes = 0
            short_bias_votes = 0

            index_price = float(market_data.get('current_price', {}).get('usd', 0) or 0)

            for ticker in tickers:
                last_price = ticker.get('last')
                if last_price is None:
                    continue

                analyzed += 1
                try:
                    last_price = float(last_price)
                except (TypeError, ValueError):
                    continue

                index_ref = ticker.get('index_price')
                if index_ref is None:
                    converted_last = ticker.get('converted_last', {})
                    if isinstance(converted_last, dict):
                        index_ref = converted_last.get('usd')
                try:
                    index_ref = float(index_ref) if index_ref is not None else (index_price or last_price)
                except (TypeError, ValueError):
                    index_ref = index_price or last_price

                if index_ref:
                    basis = (last_price - index_ref) / index_ref
                    basis_values.append(basis)
                    if basis > 0:
                        long_bias_votes += 1
                    elif basis < 0:
                        short_bias_votes += 1

                funding_rate = None
                for key in ('funding_rate', 'funding_rate_percentage'):
                    if key in ticker and ticker[key] is not None:
                        funding_rate = float(ticker[key])
                        if key == 'funding_rate_percentage':
                            funding_rate /= 100.0
                        break
                if funding_rate is not None:
                    funding_rates.append(funding_rate)
                    if funding_rate > 0:
                        long_bias_votes += 0.5
                    elif funding_rate < 0:
                        short_bias_votes += 0.5

                oi = ticker.get('open_interest_usd') or ticker.get('open_interest')
                try:
                    oi = float(oi) if oi is not None else 0.0
                except (TypeError, ValueError):
                    oi = 0.0
                open_interest_usd += oi

                converted_volume = ticker.get('converted_volume', {})
                if isinstance(converted_volume, dict):
                    try:
                        total_volume += float(converted_volume.get('usd', 0) or 0)
                    except (TypeError, ValueError):
                        pass

                contract_type = ticker.get('contract_type')
                expiry = ticker.get('expires_at') or ticker.get('expired_at')
                if contract_type and contract_type.lower() != 'perpetual' and expiry:
                    try:
                        expiry_dt = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
                    except Exception:
                        expiry_dt = None
                    if expiry_dt:
                        expiries.append((expiry_dt, oi))

            if analyzed == 0:
                return default

            avg_basis = float(np.mean(basis_values)) if basis_values else 0.0
            avg_funding = float(np.mean(funding_rates)) if funding_rates else 0.0

            basis_score = float(np.clip(avg_basis * 20.0, -1.0, 1.0))
            funding_score = float(np.clip(avg_funding * 400.0, -1.0, 1.0))

            open_interest_ratio = (open_interest_usd / market_cap) if market_cap else 0.0
            open_interest_score = float(np.clip((open_interest_ratio - 0.05) * 5.0, -1.0, 1.0))

            dominant_expiry = 'perpetual focus'
            if expiries:
                expiries.sort(key=lambda item: (item[0], -item[1]))
                nearest = expiries[0][0]
                dominant_expiry = nearest.date().isoformat()

            bias = 'balanced'
            if long_bias_votes > short_bias_votes * 1.2:
                bias = 'long'
            elif short_bias_votes > long_bias_votes * 1.2:
                bias = 'short'

            return {
                'tickers_analyzed': analyzed,
                'avg_basis': avg_basis,
                'basis_score': basis_score,
                'avg_funding_rate': avg_funding,
                'funding_score': funding_score,
                'open_interest_score': open_interest_score,
                'open_interest_ratio': open_interest_ratio,
                'total_open_interest': open_interest_usd,
                'total_volume': total_volume,
                'long_short_bias': bias,
                'dominant_expiry': dominant_expiry,
            }

        except Exception as exc:
            print(f"Error fetching derivatives metrics for {coin_id}: {exc}")
            return default

    def fetch_macro_context(self) -> Dict:
        """Retrieve broader crypto macro sentiment such as fear & greed."""

        try:
            response = self.session.get('https://api.alternative.me/fng/', timeout=10)
            if response.status_code != 200:
                return {}

            payload = response.json()
            data = payload.get('data', []) if isinstance(payload, dict) else []
            if not data:
                return {}

            latest = data[0]
            value = float(latest.get('value')) if latest.get('value') is not None else None
            if value is None:
                return {}

            score = float(np.clip((value - 50.0) / 50.0, -1.0, 1.0))
            classification = latest.get('value_classification')
            timestamp = latest.get('timestamp')

            return {
                'fear_greed_value': value,
                'macro_bias': score,
                'classification': classification,
                'timestamp': timestamp,
            }

        except Exception as exc:
            print(f"Error fetching macro context: {exc}")
            return {}

    def build_onchain_metrics(self, market_data: Dict, price_history_df: pd.DataFrame, macro_context: Dict) -> Dict:
        """Synthesize on-chain style metrics from market data and price history."""

        volume_24h = float(market_data.get('total_volume', {}).get('usd', 0) or 0)
        market_cap = float(market_data.get('market_cap', {}).get('usd', 0) or 0)
        circulating = float(market_data.get('circulating_supply') or 0)
        total_supply = float(market_data.get('total_supply') or 0)

        volume_ratio = (volume_24h / market_cap) if market_cap else 0.0
        volume_score = float(np.clip((volume_ratio - 0.05) * 10.0, -1.0, 1.0))

        momentum_score = 0.0
        volatility_bias = 0.0
        data_points = 0

        if not price_history_df.empty and len(price_history_df) >= 10:
            closes = price_history_df['close'].astype(float)
            returns = closes.pct_change().dropna()
            if len(closes) >= 8:
                window_return = (closes.iloc[-1] / closes.iloc[-8]) - 1.0
                momentum_score = float(np.clip(window_return * 5.0, -1.0, 1.0))
                data_points += 1

            if len(returns) >= 20:
                recent_vol = returns.iloc[-20:].std()
                longer_vol = returns.std()
                if longer_vol and not np.isnan(longer_vol):
                    ratio = recent_vol / longer_vol if longer_vol != 0 else 1.0
                    volatility_bias = float(np.clip((ratio - 1.0) * 2.0, -1.0, 1.0))
                    data_points += 1

        supply_pressure = 0.0
        if total_supply:
            supply_pressure = float(np.clip(((circulating / total_supply) - 0.7) * 2.0, -1.0, 1.0))
            data_points += 1

        macro_bias = float(macro_context.get('macro_bias', 0.0)) if macro_context else 0.0

        return {
            'volume_market_cap_ratio': volume_ratio,
            'volume_score': volume_score,
            'momentum_score': momentum_score,
            'volatility_bias': volatility_bias,
            'supply_pressure': supply_pressure,
            'macro_bias': macro_bias,
            'macro_context': macro_context,
            'data_points': data_points,
        }

    def build_quant_insights(
        self,
        symbol: str,
        coin_id: str,
        coin_data: Dict,
        price_history_df: pd.DataFrame,
    ) -> Dict:
        """Combine alternative data inputs used by quant crypto desks."""

        market_data = coin_data.get('market_data', {}) or {}
        news = self.fetch_news_sentiment(symbol)
        derivatives = self.fetch_derivatives_metrics(coin_id, market_data)
        macro_context = self.fetch_macro_context()
        onchain = self.build_onchain_metrics(market_data, price_history_df, macro_context)

        insights = {
            'news': news,
            'derivatives': derivatives,
            'onchain': onchain,
        }

        if macro_context:
            insights['macro'] = macro_context

        return insights

    def calculate_directional_bias(
        self, coin_id: str, coin_data: Dict, price_history_df: pd.DataFrame
    ) -> Optional[Dict]:
        """Apply directional influencer framework to crypto assets."""

        try:
            market_data = coin_data.get('market_data', {})
            current_price = market_data.get('current_price', {}).get('usd', 0)

            if current_price is None or current_price <= 0 or price_history_df.empty:
                return None

            df = price_history_df.copy()
            df = df.dropna(subset=['close'])
            if df.empty or len(df) < 20:
                return None

            price_change = market_data.get('price_change_percentage_24h', 0) or 0
            if len(df) >= 2:
                prev_close = df['close'].iloc[-2]
                if prev_close:
                    price_change = ((df['close'].iloc[-1] - prev_close) / prev_close) * 100

            symbol = coin_data.get('symbol', coin_id).upper()

            signal_data = {
                'options_chain': self._empty_options_frame.copy(),
                'options_data': self._empty_options_frame.copy(),
                'stock_price': current_price,
                'atm_iv': 0.0,
                'historical_volume': {},
                'price_change': price_change,
                'price_history': df[['open', 'high', 'low', 'close', 'volume']].copy(),
            }

            quant_insights = self.build_quant_insights(symbol, coin_id, coin_data, df)
            signal_data['quant_insights'] = quant_insights
            signal_data['news_sentiment'] = quant_insights.get('news', {})
            signal_data['derivatives_metrics'] = quant_insights.get('derivatives', {})

            directional_score = self.signal_aggregator.aggregate(symbol, signal_data)
            breakdown = self.signal_aggregator.get_signal_breakdown(directional_score)

            return {
                'direction': directional_score.direction.value,
                'confidence': round(directional_score.confidence, 2),
                'score': round(directional_score.score, 2),
                'recommendation': directional_score.recommendation,
                'signals': breakdown['signals'],
                'insights': quant_insights,
                'timestamp': directional_score.timestamp.isoformat(),
            }

        except Exception as e:
            print(f"Error calculating directional bias for {coin_id}: {e}")
            return None
    
    def analyze_volume_patterns(self, market_data: Dict) -> Dict:
        """Analyze volume patterns for unusual activity"""
        try:
            volume_data = market_data.get('total_volume', {})
            current_volume = volume_data.get('usd', 0)
            
            # Get volume data for comparison
            volume_24h = market_data.get('market_data', {}).get('total_volume', {}).get('usd', 0)
            volume_change_24h = market_data.get('market_data', {}).get('total_volume', {}).get('usd_24h_change_percentage', 0)
            
            score = 0
            reasons = []
            
            # Volume spike detection
            if volume_change_24h > 100:
                score += 30
                reasons.append(f"Massive volume spike: {volume_change_24h:.1f}% increase")
            elif volume_change_24h > 50:
                score += 20
                reasons.append(f"Significant volume increase: {volume_change_24h:.1f}%")
            elif volume_change_24h > 25:
                score += 10
                reasons.append(f"Moderate volume increase: {volume_change_24h:.1f}%")
            
            # Volume vs market cap ratio
            market_cap = market_data.get('market_data', {}).get('market_cap', {}).get('usd', 0)
            if market_cap > 0:
                volume_market_cap_ratio = (volume_24h / market_cap) * 100
                if volume_market_cap_ratio > 20:
                    score += 25
                    reasons.append(f"Extreme volume/market cap ratio: {volume_market_cap_ratio:.1f}%")
                elif volume_market_cap_ratio > 10:
                    score += 15
                    reasons.append(f"High volume/market cap ratio: {volume_market_cap_ratio:.1f}%")
                elif volume_market_cap_ratio > 5:
                    score += 10
                    reasons.append(f"Elevated volume/market cap ratio: {volume_market_cap_ratio:.1f}%")
            
            return {
                'score': score,
                'reasons': reasons,
                'volume_change_24h': volume_change_24h,
                'volume_market_cap_ratio': (volume_24h / market_cap) * 100 if market_cap > 0 else 0
            }
            
        except Exception as e:
            print(f"Error analyzing volume patterns: {e}")
            return {'score': 0, 'reasons': [], 'volume_change_24h': 0, 'volume_market_cap_ratio': 0}
    
    def analyze_technical_indicators(self, price_history: List) -> Dict:
        """Analyze technical indicators from price history"""
        try:
            if not price_history or len(price_history) < 7:
                return {'score': 0, 'reasons': []}
            
            # Convert to DataFrame
            df = pd.DataFrame(price_history, columns=['timestamp', 'price'])
            df['price'] = pd.to_numeric(df['price'])
            df = df.sort_values('timestamp')
            
            score = 0
            reasons = []
            
            # Calculate moving averages
            df['sma_7'] = df['price'].rolling(window=7).mean()
            df['sma_21'] = df['price'].rolling(window=21).mean()
            
            # Current price vs moving averages
            current_price = df['price'].iloc[-1]
            sma_7 = df['sma_7'].iloc[-1]
            sma_21 = df['sma_21'].iloc[-1]
            
            # Breakout patterns
            if current_price > sma_7 > sma_21:
                score += 20
                reasons.append("Price above both moving averages - bullish trend")
            elif current_price > sma_7:
                score += 10
                reasons.append("Price above short-term moving average")
            
            # Momentum analysis
            price_change_7d = ((current_price - df['price'].iloc[-8]) / df['price'].iloc[-8]) * 100
            if price_change_7d > 20:
                score += 25
                reasons.append(f"Strong 7-day momentum: {price_change_7d:.1f}%")
            elif price_change_7d > 10:
                score += 15
                reasons.append(f"Good 7-day momentum: {price_change_7d:.1f}%")
            elif price_change_7d > 5:
                score += 10
                reasons.append(f"Positive 7-day momentum: {price_change_7d:.1f}%")
            
            # Volatility analysis
            price_volatility = df['price'].pct_change().std() * 100
            if price_volatility > 10:
                score += 15
                reasons.append(f"High volatility: {price_volatility:.1f}% - potential for big moves")
            elif price_volatility > 5:
                score += 10
                reasons.append(f"Moderate volatility: {price_volatility:.1f}%")
            
            # RSI calculation (simplified)
            price_changes = df['price'].pct_change().dropna()
            if len(price_changes) >= 14:
                gains = price_changes[price_changes > 0].mean() * 100
                losses = abs(price_changes[price_changes < 0].mean()) * 100
                if losses != 0:
                    rs = gains / losses
                    rsi = 100 - (100 / (1 + rs))
                    
                    if rsi < 30:
                        score += 20
                        reasons.append(f"Oversold condition (RSI: {rsi:.1f}) - potential bounce")
                    elif rsi > 70:
                        score += 15
                        reasons.append(f"Overbought condition (RSI: {rsi:.1f}) - momentum play")
            
            return {
                'score': score,
                'reasons': reasons,
                'price_change_7d': price_change_7d,
                'volatility': price_volatility,
                'current_price': current_price
            }
            
        except Exception as e:
            print(f"Error analyzing technical indicators: {e}")
            return {'score': 0, 'reasons': []}
    
    def analyze_fundamentals(self, coin_data: Dict) -> Dict:
        """Analyze fundamental metrics"""
        try:
            score = 0
            reasons = []
            
            market_data = coin_data.get('market_data', {})
            community_data = coin_data.get('community_data', {})
            developer_data = coin_data.get('developer_data', {})
            
            # Market cap analysis
            market_cap = market_data.get('market_cap', {}).get('usd', 0)
            if market_cap < 100_000_000:  # Under $100M
                score += 25
                reasons.append("Small cap - high growth potential")
            elif market_cap < 1_000_000_000:  # Under $1B
                score += 15
                reasons.append("Mid cap - good growth potential")
            
            # Price change analysis
            price_change_24h = market_data.get('price_change_percentage_24h', 0)
            price_change_7d = market_data.get('price_change_percentage_7d', 0)
            price_change_30d = market_data.get('price_change_percentage_30d', 0)
            
            # Recent momentum
            if price_change_24h > 15:
                score += 20
                reasons.append(f"Strong 24h momentum: {price_change_24h:.1f}%")
            elif price_change_24h > 10:
                score += 15
                reasons.append(f"Good 24h momentum: {price_change_24h:.1f}%")
            elif price_change_24h > 5:
                score += 10
                reasons.append(f"Positive 24h momentum: {price_change_24h:.1f}%")
            
            # Multi-timeframe momentum
            if price_change_7d > 0 and price_change_30d > 0:
                score += 15
                reasons.append("Consistent positive momentum across timeframes")
            
            # Community metrics
            twitter_followers = community_data.get('twitter_followers', 0)
            reddit_subscribers = community_data.get('reddit_subscribers', 0)
            
            if twitter_followers > 100_000:
                score += 10
                reasons.append(f"Strong Twitter presence: {twitter_followers:,} followers")
            if reddit_subscribers > 50_000:
                score += 10
                reasons.append(f"Active Reddit community: {reddit_subscribers:,} subscribers")
            
            # Developer activity
            if developer_data:
                commits_count = developer_data.get('commit_count_4_weeks', 0)
                if commits_count > 100:
                    score += 15
                    reasons.append(f"High developer activity: {commits_count} commits (4 weeks)")
                elif commits_count > 50:
                    score += 10
                    reasons.append(f"Good developer activity: {commits_count} commits (4 weeks)")
            
            # Circulating supply vs total supply
            circulating_supply = market_data.get('circulating_supply', 0)
            total_supply = market_data.get('total_supply', 0)
            
            if total_supply > 0:
                supply_ratio = (circulating_supply / total_supply) * 100
                if supply_ratio < 50:
                    score += 15
                    reasons.append(f"Limited circulating supply: {supply_ratio:.1f}% of total")
                elif supply_ratio < 75:
                    score += 10
                    reasons.append(f"Moderate circulating supply: {supply_ratio:.1f}% of total")
            
            return {
                'score': score,
                'reasons': reasons,
                'market_cap': market_cap,
                'price_change_24h': price_change_24h,
                'price_change_7d': price_change_7d,
                'price_change_30d': price_change_30d,
                'supply_ratio': (circulating_supply / total_supply) * 100 if total_supply > 0 else 100
            }
            
        except Exception as e:
            print(f"Error analyzing fundamentals: {e}")
            return {'score': 0, 'reasons': []}
    
    def analyze_market_sentiment(self, coin_data: Dict) -> Dict:
        """Analyze market sentiment indicators"""
        try:
            score = 0
            reasons = []
            
            market_data = coin_data.get('market_data', {})
            
            # Fear & Greed indicators (simplified)
            price_change_24h = market_data.get('price_change_percentage_24h', 0)
            volume_change_24h = market_data.get('total_volume', {}).get('usd_24h_change_percentage', 0)
            
            # Volume-price divergence analysis
            if price_change_24h > 0 and volume_change_24h > 0:
                if volume_change_24h > price_change_24h * 2:
                    score += 20
                    reasons.append("Volume leading price - strong bullish sentiment")
                elif volume_change_24h > price_change_24h:
                    score += 15
                    reasons.append("Volume supporting price move")
            
            # Market cap rank analysis
            market_cap_rank = market_data.get('market_cap_rank', 999999)
            if market_cap_rank <= 100:
                score += 10
                reasons.append(f"Top 100 coin (rank #{market_cap_rank})")
            elif market_cap_rank <= 200:
                score += 5
                reasons.append(f"Top 200 coin (rank #{market_cap_rank})")
            
            # ATH analysis
            ath = market_data.get('ath', {}).get('usd', 0)
            current_price = market_data.get('current_price', {}).get('usd', 0)
            
            if ath > 0 and current_price > 0:
                ath_percentage = ((current_price - ath) / ath) * 100
                if ath_percentage > -20:  # Within 20% of ATH
                    score += 15
                    reasons.append(f"Near all-time high: {ath_percentage:.1f}% from ATH")
                elif ath_percentage > -50:  # Within 50% of ATH
                    score += 10
                    reasons.append(f"Recovering toward ATH: {ath_percentage:.1f}% from ATH")
            
            return {
                'score': score,
                'reasons': reasons,
                'market_cap_rank': market_cap_rank,
                'ath_percentage': ath_percentage if ath > 0 and current_price > 0 else 0
            }
            
        except Exception as e:
            print(f"Error analyzing market sentiment: {e}")
            return {'score': 0, 'reasons': []}
    

    def scan_crypto_opportunities(self) -> List[Dict]:
        """Main function to scan for crypto opportunities"""
        opportunities = []
        rate_limit_hit = False
        
        print("Starting crypto scan for explosive opportunities...")
        
        # FAST MODE: Scan only first 5 crypto coins for quick results
        fast_watchlist = self.crypto_watchlist[:5]
        for i, coin_id in enumerate(fast_watchlist):
            print(f"Scanning {coin_id} ({i+1}/{len(fast_watchlist)})...")
            
            # Rate limiting - more aggressive for CoinGecko
            if i > 0 and i % 2 == 0:
                time.sleep(3)  # Pause every 2 requests for 3 seconds
            elif i > 0:
                time.sleep(1)  # 1 second between each request
            
            # Get coin data
            coin_data = self.get_crypto_data(coin_id)
            if not coin_data:
                if i > 5:  # If we hit rate limits early, switch to sample data
                    rate_limit_hit = True
                    break
                continue
            
            # Get price history (list + OHLCV DataFrame)
            price_history, price_history_df = self.get_price_history_with_dataframe(coin_id, days=90)

            # Analyze different aspects
            volume_analysis = self.analyze_volume_patterns(coin_data)
            technical_analysis = self.analyze_technical_indicators(price_history)
            fundamentals_analysis = self.analyze_fundamentals(coin_data)
            sentiment_analysis = self.analyze_market_sentiment(coin_data)
            directional_bias = self.calculate_directional_bias(coin_id, coin_data, price_history_df)
            
            # Calculate total score
            total_score = (
                volume_analysis['score'] +
                technical_analysis['score'] +
                fundamentals_analysis['score'] +
                sentiment_analysis['score']
            )
            
            # Only include high-scoring opportunities
            if total_score >= 60:  # Minimum score threshold
                market_data = coin_data.get('market_data', {})
                current_price = market_data.get('current_price', {}).get('usd', 0)
                
                # Combine all reasons
                all_reasons = []
                all_reasons.extend(volume_analysis['reasons'])
                all_reasons.extend(technical_analysis['reasons'])
                all_reasons.extend(fundamentals_analysis['reasons'])
                all_reasons.extend(sentiment_analysis['reasons'])
                
                opportunity = {
                    'symbol': coin_data.get('symbol', '').upper(),
                    'name': coin_data.get('name', ''),
                    'coin_id': coin_id,
                    'current_price': current_price,
                    'market_cap': market_data.get('market_cap', {}).get('usd', 0),
                    'market_cap_rank': market_data.get('market_cap_rank', 999999),
                    'volume_24h': market_data.get('total_volume', {}).get('usd', 0),
                    'price_change_24h': market_data.get('price_change_percentage_24h', 0),
                    'price_change_7d': market_data.get('price_change_percentage_7d', 0),
                    'total_score': total_score,
                    'volume_score': volume_analysis['score'],
                    'technical_score': technical_analysis['score'],
                    'fundamentals_score': fundamentals_analysis['score'],
                    'sentiment_score': sentiment_analysis['score'],
                    'reasons': all_reasons[:10],  # Top 10 reasons
                    'volume_change_24h': volume_analysis['volume_change_24h'],
                    'price_change_7d': technical_analysis.get('price_change_7d', 0),
                    'volatility': technical_analysis.get('volatility', 0),
                    'supply_ratio': fundamentals_analysis['supply_ratio'],
                    'ath_percentage': sentiment_analysis['ath_percentage'],
                }

                if directional_bias:
                    opportunity['directional_bias'] = directional_bias

                opportunities.append(opportunity)
        
        # No sample data - only real market opportunities
        if rate_limit_hit or len(opportunities) == 0:
            print("Rate limit detected or no opportunities found. Try again later when API limits reset.")
        
        # Sort by total score
        opportunities.sort(key=lambda x: x['total_score'], reverse=True)
        
        print(f"Found {len(opportunities)} crypto opportunities with score >= 60")
        return opportunities
    
    def calculate_trading_signals(self, coin_data: Dict, price_history: List) -> Dict:
        """Calculate buy/sell/rebalance signals based on multiple strategies"""
        try:
            market_data = coin_data.get('market_data', {})
            current_price = market_data.get('current_price', {}).get('usd', 0)
            
            signals = {
                'action': 'HOLD',
                'confidence': 0,
                'entry_price': 0,
                'target_price': 0,
                'stop_loss': 0,
                'position_size': 0,
                'strategy': '',
                'reasons': [],
                'risk_level': 'medium'
            }
            
            # Strategy 1: Momentum Breakout
            momentum_signal = self._momentum_breakout_strategy(coin_data, price_history)
            
            # Strategy 2: Mean Reversion
            mean_reversion_signal = self._mean_reversion_strategy(coin_data, price_history)
            
            # Strategy 3: Volume Surge
            volume_signal = self._volume_surge_strategy(coin_data)
            
            # Strategy 4: Fundamental Value
            value_signal = self._fundamental_value_strategy(coin_data)
            
            # Strategy 5: Technical Patterns
            technical_signal = self._technical_pattern_strategy(price_history)
            
            # Combine signals with weights
            signals_data = [
                (momentum_signal, 0.25),
                (mean_reversion_signal, 0.20),
                (volume_signal, 0.25),
                (value_signal, 0.15),
                (technical_signal, 0.15)
            ]
            
            # Calculate weighted average
            total_confidence = 0
            weighted_action = 0  # -1 = SELL, 0 = HOLD, 1 = BUY
            all_reasons = []
            
            for signal, weight in signals_data:
                if signal['confidence'] > 0:
                    total_confidence += signal['confidence'] * weight
                    weighted_action += signal['action_score'] * weight
                    all_reasons.extend(signal['reasons'])
            
            # Determine final action
            if weighted_action > 0.3 and total_confidence > 60:
                signals['action'] = 'BUY'
                signals['confidence'] = total_confidence
                signals['strategy'] = self._get_dominant_strategy(signals_data)
            elif weighted_action < -0.3 and total_confidence > 60:
                signals['action'] = 'SELL'
                signals['confidence'] = total_confidence
                signals['strategy'] = self._get_dominant_strategy(signals_data)
            else:
                signals['action'] = 'HOLD'
                signals['confidence'] = 100 - total_confidence
                signals['strategy'] = 'Consolidation'
            
            # Calculate price targets
            if signals['action'] != 'HOLD':
                signals.update(self._calculate_price_targets(coin_data, price_history, signals['action']))
            
            # Calculate position sizing
            signals['position_size'] = self._calculate_position_size(coin_data, signals)
            
            # Determine risk level
            signals['risk_level'] = self._assess_risk_level(coin_data, signals)
            
            signals['reasons'] = all_reasons[:8]  # Top 8 reasons
            
            return signals
            
        except Exception as e:
            print(f"Error calculating trading signals: {e}")
            return {
                'action': 'HOLD',
                'confidence': 0,
                'reasons': ['Error in signal calculation'],
                'risk_level': 'high'
            }
    
    def _momentum_breakout_strategy(self, coin_data: Dict, price_history: List) -> Dict:
        """Momentum breakout strategy"""
        try:
            market_data = coin_data.get('market_data', {})
            price_change_24h = market_data.get('price_change_percentage_24h', 0)
            price_change_7d = market_data.get('price_change_percentage_7d', 0)
            
            confidence = 0
            action_score = 0  # -1 to 1
            reasons = []
            
            # Strong momentum criteria
            if price_change_24h > 15 and price_change_7d > 30:
                confidence = 90
                action_score = 1
                reasons.append(f"Strong momentum breakout: {price_change_24h:.1f}% (24h), {price_change_7d:.1f}% (7d)")
            elif price_change_24h > 10 and price_change_7d > 20:
                confidence = 75
                action_score = 0.8
                reasons.append(f"Good momentum: {price_change_24h:.1f}% (24h), {price_change_7d:.1f}% (7d)")
            elif price_change_24h > 5 and price_change_7d > 10:
                confidence = 60
                action_score = 0.5
                reasons.append(f"Positive momentum: {price_change_24h:.1f}% (24h), {price_change_7d:.1f}% (7d)")
            
            # Volume confirmation
            volume_change = market_data.get('total_volume', {}).get('usd_24h_change_percentage', 0)
            if volume_change > 50:
                confidence += 10
                reasons.append(f"Volume supporting momentum: {volume_change:.1f}% increase")
            
            return {
                'confidence': min(confidence, 100),
                'action_score': action_score,
                'reasons': reasons,
                'strategy': 'Momentum Breakout'
            }
            
        except Exception as e:
            return {'confidence': 0, 'action_score': 0, 'reasons': [], 'strategy': 'Momentum Breakout'}
    
    def _mean_reversion_strategy(self, coin_data: Dict, price_history: List) -> Dict:
        """Mean reversion strategy for oversold/overbought conditions"""
        try:
            if not price_history or len(price_history) < 21:
                return {'confidence': 0, 'action_score': 0, 'reasons': [], 'strategy': 'Mean Reversion'}
            
            # Calculate RSI and moving averages
            df = pd.DataFrame(price_history, columns=['timestamp', 'price'])
            df['price'] = pd.to_numeric(df['price'])
            
            # Simple RSI calculation
            delta = df['price'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
            rs = gain / loss
            rsi = 100 - (100 / (1 + rs))
            
            current_rsi = rsi.iloc[-1]
            sma_21 = df['price'].rolling(window=21).mean().iloc[-1]
            current_price = df['price'].iloc[-1]
            
            confidence = 0
            action_score = 0
            reasons = []
            
            # Oversold conditions (buy signal)
            if current_rsi < 30 and current_price < sma_21:
                confidence = 80
                action_score = 0.8
                reasons.append(f"Oversold condition: RSI {current_rsi:.1f}, price below 21-day SMA")
            elif current_rsi < 40 and current_price < sma_21:
                confidence = 60
                action_score = 0.5
                reasons.append(f"Near oversold: RSI {current_rsi:.1f}, price below 21-day SMA")
            
            # Overbought conditions (sell signal)
            elif current_rsi > 70 and current_price > sma_21:
                confidence = 80
                action_score = -0.8
                reasons.append(f"Overbought condition: RSI {current_rsi:.1f}, price above 21-day SMA")
            elif current_rsi > 60 and current_price > sma_21:
                confidence = 60
                action_score = -0.5
                reasons.append(f"Near overbought: RSI {current_rsi:.1f}, price above 21-day SMA")
            
            return {
                'confidence': confidence,
                'action_score': action_score,
                'reasons': reasons,
                'strategy': 'Mean Reversion'
            }
            
        except Exception as e:
            return {'confidence': 0, 'action_score': 0, 'reasons': [], 'strategy': 'Mean Reversion'}
    
    def _volume_surge_strategy(self, coin_data: Dict) -> Dict:
        """Volume surge strategy for unusual activity"""
        try:
            market_data = coin_data.get('market_data', {})
            volume_change = market_data.get('total_volume', {}).get('usd_24h_change_percentage', 0)
            price_change = market_data.get('price_change_percentage_24h', 0)
            
            confidence = 0
            action_score = 0
            reasons = []
            
            # Volume-price divergence
            if volume_change > 100 and price_change > 5:
                confidence = 85
                action_score = 1
                reasons.append(f"Volume surge with price breakout: {volume_change:.1f}% volume, {price_change:.1f}% price")
            elif volume_change > 50 and price_change > 0:
                confidence = 70
                action_score = 0.7
                reasons.append(f"Significant volume increase: {volume_change:.1f}% with positive price action")
            elif volume_change > 25:
                confidence = 50
                action_score = 0.3
                reasons.append(f"Elevated volume: {volume_change:.1f}% increase")
            
            # Volume without price movement (potential accumulation)
            if volume_change > 75 and abs(price_change) < 2:
                confidence = 60
                action_score = 0.6
                reasons.append(f"High volume with stable price - potential accumulation")
            
            return {
                'confidence': confidence,
                'action_score': action_score,
                'reasons': reasons,
                'strategy': 'Volume Surge'
            }
            
        except Exception as e:
            return {'confidence': 0, 'action_score': 0, 'reasons': [], 'strategy': 'Volume Surge'}
    
    def _fundamental_value_strategy(self, coin_data: Dict) -> Dict:
        """Fundamental value strategy based on market metrics"""
        try:
            market_data = coin_data.get('market_data', {})
            market_cap = market_data.get('market_cap', {}).get('usd', 0)
            volume_24h = market_data.get('total_volume', {}).get('usd', 0)
            
            confidence = 0
            action_score = 0
            reasons = []
            
            # Market cap analysis
            if market_cap < 50_000_000:  # Micro cap
                confidence = 70
                action_score = 0.8
                reasons.append(f"Micro cap opportunity: ${market_cap/1_000_000:.1f}M market cap")
            elif market_cap < 500_000_000:  # Small cap
                confidence = 50
                action_score = 0.5
                reasons.append(f"Small cap with growth potential: ${market_cap/1_000_000:.1f}M market cap")
            
            # Volume/Market Cap ratio
            if market_cap > 0:
                volume_ratio = (volume_24h / market_cap) * 100
                if volume_ratio > 15:
                    confidence += 20
                    action_score += 0.3
                    reasons.append(f"High trading activity: {volume_ratio:.1f}% volume/market cap ratio")
            
            # Price relative to ATH
            ath = market_data.get('ath', {}).get('usd', 0)
            current_price = market_data.get('current_price', {}).get('usd', 0)
            
            if ath > 0 and current_price > 0:
                ath_percentage = ((current_price - ath) / ath) * 100
                if ath_percentage < -70:  # Down 70% from ATH
                    confidence += 15
                    action_score += 0.4
                    reasons.append(f"Deep discount from ATH: {ath_percentage:.1f}%")
                elif ath_percentage < -50:  # Down 50% from ATH
                    confidence += 10
                    action_score += 0.2
                    reasons.append(f"Significant discount from ATH: {ath_percentage:.1f}%")
            
            return {
                'confidence': min(confidence, 100),
                'action_score': action_score,
                'reasons': reasons,
                'strategy': 'Fundamental Value'
            }
            
        except Exception as e:
            return {'confidence': 0, 'action_score': 0, 'reasons': [], 'strategy': 'Fundamental Value'}
    
    def _technical_pattern_strategy(self, price_history: List) -> Dict:
        """Technical pattern recognition strategy"""
        try:
            if not price_history or len(price_history) < 20:
                return {'confidence': 0, 'action_score': 0, 'reasons': [], 'strategy': 'Technical Patterns'}
            
            df = pd.DataFrame(price_history, columns=['timestamp', 'price'])
            df['price'] = pd.to_numeric(df['price'])
            
            confidence = 0
            action_score = 0
            reasons = []
            
            # Calculate moving averages
            df['sma_10'] = df['price'].rolling(window=10).mean()
            df['sma_20'] = df['price'].rolling(window=20).mean()
            df['ema_12'] = df['price'].ewm(span=12).mean()
            df['ema_26'] = df['price'].ewm(span=26).mean()
            
            current_price = df['price'].iloc[-1]
            sma_10 = df['sma_10'].iloc[-1]
            sma_20 = df['sma_20'].iloc[-1]
            ema_12 = df['ema_12'].iloc[-1]
            ema_26 = df['ema_26'].iloc[-1]
            
            # Golden Cross (bullish)
            if ema_12 > ema_26 and df['ema_12'].iloc[-2] <= df['ema_26'].iloc[-2]:
                confidence = 80
                action_score = 1
                reasons.append("Golden Cross: EMA 12 crossed above EMA 26")
            elif ema_12 > ema_26:
                confidence = 60
                action_score = 0.6
                reasons.append("EMA 12 above EMA 26 - bullish trend")
            
            # Death Cross (bearish)
            elif ema_12 < ema_26 and df['ema_12'].iloc[-2] >= df['ema_26'].iloc[-2]:
                confidence = 80
                action_score = -1
                reasons.append("Death Cross: EMA 12 crossed below EMA 26")
            elif ema_12 < ema_26:
                confidence = 60
                action_score = -0.6
                reasons.append("EMA 12 below EMA 26 - bearish trend")
            
            # Price above/below moving averages
            if current_price > sma_10 > sma_20:
                confidence += 15
                action_score += 0.3
                reasons.append("Price above both moving averages")
            elif current_price < sma_10 < sma_20:
                confidence += 15
                action_score -= 0.3
                reasons.append("Price below both moving averages")
            
            return {
                'confidence': min(confidence, 100),
                'action_score': max(-1, min(1, action_score)),
                'reasons': reasons,
                'strategy': 'Technical Patterns'
            }
            
        except Exception as e:
            return {'confidence': 0, 'action_score': 0, 'reasons': [], 'strategy': 'Technical Patterns'}
    
    def _get_dominant_strategy(self, signals_data: List[Tuple]) -> str:
        """Get the dominant strategy from signal analysis"""
        strategy_scores = {}
        
        for signal, weight in signals_data:
            strategy = signal['strategy']
            score = signal['confidence'] * weight
            
            if strategy not in strategy_scores:
                strategy_scores[strategy] = 0
            strategy_scores[strategy] += score
        
        return max(strategy_scores.items(), key=lambda x: x[1])[0] if strategy_scores else 'Mixed'
    
    def _calculate_price_targets(self, coin_data: Dict, price_history: List, action: str) -> Dict:
        """Calculate entry, target, and stop-loss prices"""
        try:
            market_data = coin_data.get('market_data', {})
            current_price = market_data.get('current_price', {}).get('usd', 0)
            
            if not price_history or len(price_history) < 20:
                return {
                    'entry_price': current_price,
                    'target_price': current_price * 1.2 if action == 'BUY' else current_price * 0.8,
                    'stop_loss': current_price * 0.9 if action == 'BUY' else current_price * 1.1
                }
            
            df = pd.DataFrame(price_history, columns=['timestamp', 'price'])
            df['price'] = pd.to_numeric(df['price'])
            
            # Calculate volatility
            returns = df['price'].pct_change().dropna()
            volatility = returns.std() * 100
            
            # Calculate support and resistance levels
            recent_high = df['price'].tail(20).max()
            recent_low = df['price'].tail(20).min()
            recent_range = recent_high - recent_low
            
            if action == 'BUY':
                # Entry at current price or slightly below
                entry_price = current_price * 0.98  # 2% below current for better entry
                
                # Target: 1.5x recent range or 20% gain
                target_1 = entry_price + (recent_range * 1.5)
                target_2 = entry_price * 1.2
                target_price = max(target_1, target_2)
                
                # Stop loss: 8% below entry or below recent low
                stop_1 = entry_price * 0.92
                stop_2 = recent_low * 0.95
                stop_loss = min(stop_1, stop_2)
                
            else:  # SELL
                # Entry at current price or slightly above
                entry_price = current_price * 1.02  # 2% above current for better exit
                
                # Target: 1.5x recent range down or 15% decline
                target_1 = entry_price - (recent_range * 1.5)
                target_2 = entry_price * 0.85
                target_price = min(target_1, target_2)
                
                # Stop loss: 8% above entry or above recent high
                stop_1 = entry_price * 1.08
                stop_2 = recent_high * 1.05
                stop_loss = max(stop_1, stop_2)
            
            return {
                'entry_price': round(entry_price, 6),
                'target_price': round(target_price, 6),
                'stop_loss': round(stop_loss, 6)
            }
            
        except Exception as e:
            return {
                'entry_price': current_price,
                'target_price': current_price * 1.2 if action == 'BUY' else current_price * 0.8,
                'stop_loss': current_price * 0.9 if action == 'BUY' else current_price * 1.1
            }
    
    def _calculate_position_size(self, coin_data: Dict, signals: Dict) -> Dict:
        """Calculate optimal position size based on risk management"""
        try:
            market_data = coin_data.get('market_data', {})
            current_price = market_data.get('current_price', {}).get('usd', 0)
            volatility = market_data.get('price_change_percentage_24h', 0) / 100
            
            # Kelly Criterion for position sizing
            confidence = signals['confidence'] / 100
            
            # Risk parameters
            base_position = 0.02  # 2% of portfolio base
            max_position = 0.10   # 10% maximum position
            min_position = 0.005  # 0.5% minimum position
            
            # Adjust based on confidence and volatility
            position_multiplier = confidence * (1 - min(volatility, 0.5))  # Reduce size for high volatility
            
            position_size = base_position * position_multiplier
            position_size = max(min_position, min(position_size, max_position))
            
            # Calculate dollar amounts for different portfolio sizes
            portfolio_sizes = [1000, 5000, 10000, 50000, 100000]
            position_amounts = {}
            
            for portfolio_size in portfolio_sizes:
                amount = portfolio_size * position_size
                position_amounts[f'${portfolio_size:,}'] = {
                    'amount': round(amount, 2),
                    'percentage': round(position_size * 100, 1)
                }
            
            return {
                'recommended_size': round(position_size * 100, 1),  # Percentage
                'position_amounts': position_amounts,
                'risk_level': signals['risk_level']
            }
            
        except Exception as e:
            return {
                'recommended_size': 2.0,
                'position_amounts': {},
                'risk_level': 'medium'
            }
    
    def _assess_risk_level(self, coin_data: Dict, signals: Dict) -> str:
        """Assess overall risk level of the trade"""
        try:
            market_data = coin_data.get('market_data', {})
            market_cap = market_data.get('market_cap', {}).get('usd', 0)
            volatility = abs(market_data.get('price_change_percentage_24h', 0))
            
            risk_score = 0
            
            # Market cap risk
            if market_cap < 10_000_000:
                risk_score += 40  # Very high risk
            elif market_cap < 100_000_000:
                risk_score += 25  # High risk
            elif market_cap < 1_000_000_000:
                risk_score += 15  # Medium risk
            else:
                risk_score += 5   # Low risk
            
            # Volatility risk
            if volatility > 20:
                risk_score += 30
            elif volatility > 10:
                risk_score += 20
            elif volatility > 5:
                risk_score += 10
            
            # Signal confidence risk
            if signals['confidence'] < 60:
                risk_score += 20
            elif signals['confidence'] < 80:
                risk_score += 10
            
            # Determine risk level
            if risk_score >= 60:
                return 'high'
            elif risk_score >= 40:
                return 'medium'
            else:
                return 'low'
                
        except Exception as e:
            return 'medium'
    
    def generate_trading_alerts(self, opportunities: List[Dict]) -> List[Dict]:
        """Generate actionable trading alerts with buy/sell/rebalance signals"""
        alerts = []
        
        for opp in opportunities:
            # Get fresh data for signal calculation
            coin_data = self.get_crypto_data(opp['coin_id'])
            if not coin_data:
                continue
            
            price_history, price_history_df = self.get_price_history_with_dataframe(opp['coin_id'], days=90)
            signals = self.calculate_trading_signals(coin_data, price_history)
            directional_bias = self.calculate_directional_bias(opp['coin_id'], coin_data, price_history_df)
            
            # Only create alerts for actionable signals
            if signals['action'] != 'HOLD' and signals['confidence'] > 60:
                alert = {
                    'symbol': opp['symbol'],
                    'name': opp['name'],
                    'current_price': opp['current_price'],
                    'market_cap': opp['market_cap'],
                    'action': signals['action'],
                    'confidence': signals['confidence'],
                    'strategy': signals['strategy'],
                    'entry_price': signals.get('entry_price', opp['current_price']),
                    'target_price': signals.get('target_price', 0),
                    'stop_loss': signals.get('stop_loss', 0),
                    'position_size': signals.get('position_size', {}),
                    'risk_level': signals['risk_level'],
                    'reasons': signals['reasons'],
                    'urgency': self._calculate_urgency(signals, opp),
                    'timestamp': datetime.now().isoformat()
                }

                if directional_bias:
                    alert['directional_bias'] = directional_bias

                alerts.append(alert)
        
        # Sort by urgency and confidence
        alerts.sort(key=lambda x: (x['urgency'], x['confidence']), reverse=True)
        
        return alerts
    
    def _calculate_urgency(self, signals: Dict, opp: Dict) -> int:
        """Calculate urgency score for alerts (1-10)"""
        urgency = 5  # Base urgency
        
        # Increase urgency based on confidence
        if signals['confidence'] > 90:
            urgency += 3
        elif signals['confidence'] > 80:
            urgency += 2
        elif signals['confidence'] > 70:
            urgency += 1
        
        # Increase urgency for high-momentum moves
        if abs(opp.get('price_change_24h', 0)) > 15:
            urgency += 2
        elif abs(opp.get('price_change_24h', 0)) > 10:
            urgency += 1
        
        # Increase urgency for volume surges
        if opp.get('volume_change_24h', 0) > 100:
            urgency += 2
        elif opp.get('volume_change_24h', 0) > 50:
            urgency += 1
        
        # Decrease urgency for high-risk trades
        if signals['risk_level'] == 'high':
            urgency -= 1
        
        return max(1, min(10, urgency))
    
    def scan_with_alerts(self) -> Dict:
        """Main function that scans opportunities and generates alerts"""
        print("Starting comprehensive crypto scan with trading alerts...")
        
        # Get opportunities
        opportunities = self.scan_crypto_opportunities()
        
        # Generate trading alerts
        alerts = self.generate_trading_alerts(opportunities)
        
        # Categorize alerts
        buy_alerts = [alert for alert in alerts if alert['action'] == 'BUY']
        sell_alerts = [alert for alert in alerts if alert['action'] == 'SELL']
        
        result = {
            'scan_timestamp': datetime.now().isoformat(),
            'total_opportunities': len(opportunities),
            'total_alerts': len(alerts),
            'buy_alerts': len(buy_alerts),
            'sell_alerts': len(sell_alerts),
            'opportunities': opportunities,
            'trading_alerts': alerts,
            'high_urgency_alerts': [alert for alert in alerts if alert['urgency'] >= 8],
            'summary': {
                'top_buy_opportunity': buy_alerts[0] if buy_alerts else None,
                'top_sell_opportunity': sell_alerts[0] if sell_alerts else None,
                'highest_urgency_alert': alerts[0] if alerts else None
            }
        }
        
        return result

def main():
    scanner = CryptoScanner()
    result = scanner.scan_with_alerts()
    
    # Output results
    print(json.dumps(result, indent=2))
    
    return result

if __name__ == "__main__":
    main()
