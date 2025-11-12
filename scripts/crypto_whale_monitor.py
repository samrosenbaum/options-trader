#!/usr/bin/env python3
"""
Crypto Whale Activity Monitor - Track BTC/ETH futures, shorts, and whale movements
Monitors institutional money flows, large transactions, and derivatives positioning
"""

import requests
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import sys
from pathlib import Path

# Ensure project root is on path
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))


class CryptoWhaleMonitor:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })

        # Focus on BTC and ETH
        self.primary_assets = ['bitcoin', 'ethereum']
        self.primary_symbols = {
            'bitcoin': 'BTC',
            'ethereum': 'ETH'
        }

        # API endpoints
        self.coingecko_base = "https://api.coingecko.com/api/v3"
        self.alternative_api = "https://api.alternative.me"

    def get_btc_eth_futures_data(self) -> Dict:
        """Get comprehensive futures data for Bitcoin and Ethereum"""
        print("Fetching BTC and ETH futures data...")

        results = {
            'timestamp': datetime.now().isoformat(),
            'bitcoin': {},
            'ethereum': {}
        }

        for asset in self.primary_assets:
            print(f"  Analyzing {asset} futures...")

            try:
                # Get market data
                url = f"{self.coingecko_base}/coins/{asset}"
                params = {
                    'localization': 'false',
                    'tickers': 'true',
                    'market_data': 'true',
                    'sparkline': 'false'
                }

                response = self.session.get(url, params=params, timeout=15)
                if response.status_code == 429:
                    print(f"    Rate limit hit for {asset}. Using cached/demo data...")
                    # In production, implement caching or use premium API
                    results[asset] = self._get_demo_asset_data(asset)
                    continue
                elif response.status_code == 403:
                    print(f"    API access forbidden for {asset} (may require API key). Using demo data...")
                    results[asset] = self._get_demo_asset_data(asset)
                    continue
                elif response.status_code != 200:
                    print(f"    Error fetching {asset} data: {response.status_code}")
                    results[asset] = self._get_demo_asset_data(asset)
                    continue

                data = response.json()
                market_data = data.get('market_data', {})

                # Get derivatives/futures data
                derivatives_data = self._analyze_derivatives(asset, data)

                # Get funding rates and open interest
                funding_data = self._get_funding_rates(asset, market_data)

                # Analyze long/short ratio
                long_short_analysis = self._analyze_long_short_ratio(derivatives_data)

                # Calculate institutional positioning
                institutional_signals = self._detect_institutional_activity(
                    derivatives_data,
                    funding_data,
                    market_data
                )

                # Evaluate short pressure and Monty's guidance
                short_activity = self._evaluate_short_pressure(
                    derivatives_data,
                    market_data,
                    institutional_signals
                )

                symbol = self.primary_symbols[asset]
                results[asset] = {
                    'symbol': symbol,
                    'current_price': market_data.get('current_price', {}).get('usd', 0),
                    'market_cap': market_data.get('market_cap', {}).get('usd', 0),
                    'total_volume_24h': market_data.get('total_volume', {}).get('usd', 0),
                    'price_change_24h': market_data.get('price_change_percentage_24h', 0),
                    'derivatives': derivatives_data,
                    'funding': funding_data,
                    'long_short': long_short_analysis,
                    'institutional_signals': institutional_signals,
                    'short_activity': short_activity
                }

                # Rate limiting
                time.sleep(2)

            except Exception as e:
                print(f"    Error analyzing {asset}: {e}")
                results[asset] = {'error': str(e)}

        return results

    def _analyze_derivatives(self, coin_id: str, coin_data: Dict) -> Dict:
        """Analyze futures and perpetual swaps for the asset"""
        try:
            market_data = coin_data.get('market_data', {})
            tickers = coin_data.get('tickers', [])

            futures_tickers = []
            perpetual_tickers = []

            total_futures_volume = 0
            total_perp_volume = 0
            total_open_interest = 0

            basis_values = []
            funding_rates = []

            # Analyze each ticker
            for ticker in tickers:
                market = ticker.get('market', {})
                if not isinstance(market, dict):
                    continue

                market_name = market.get('name', '').lower()

                # Focus on major derivatives exchanges
                if market_name not in ['binance_futures', 'bybit', 'okex', 'deribit', 'bitmex']:
                    continue

                contract_type = ticker.get('contract_type', '').lower()

                # Get volume
                converted_volume = ticker.get('converted_volume', {})
                if isinstance(converted_volume, dict):
                    volume_usd = float(converted_volume.get('usd', 0) or 0)
                else:
                    volume_usd = 0

                # Get open interest
                oi = ticker.get('open_interest_usd')
                if oi is None:
                    oi = ticker.get('open_interest', 0)
                oi_usd = float(oi) if oi else 0

                total_open_interest += oi_usd

                # Calculate basis (futures premium/discount)
                last_price = ticker.get('last')
                index_price = ticker.get('index_price')

                if last_price and index_price:
                    try:
                        basis = ((float(last_price) - float(index_price)) / float(index_price)) * 100
                        basis_values.append(basis)
                    except (TypeError, ValueError, ZeroDivisionError):
                        pass

                # Get funding rate for perpetuals
                if 'perpetual' in contract_type:
                    perpetual_tickers.append({
                        'exchange': market_name,
                        'volume_24h': volume_usd,
                        'open_interest': oi_usd,
                        'last_price': float(last_price) if last_price else 0
                    })
                    total_perp_volume += volume_usd

                    funding_rate = ticker.get('funding_rate')
                    if funding_rate:
                        try:
                            funding_rates.append(float(funding_rate))
                        except (TypeError, ValueError):
                            pass
                else:
                    futures_tickers.append({
                        'exchange': market_name,
                        'contract_type': contract_type,
                        'volume_24h': volume_usd,
                        'open_interest': oi_usd,
                        'last_price': float(last_price) if last_price else 0
                    })
                    total_futures_volume += volume_usd

            # Calculate averages
            avg_basis = sum(basis_values) / len(basis_values) if basis_values else 0
            avg_funding = sum(funding_rates) / len(funding_rates) if funding_rates else 0

            # Determine market sentiment from derivatives
            sentiment = self._interpret_derivatives_sentiment(avg_basis, avg_funding)

            market_cap = float(market_data.get('market_cap', {}).get('usd', 0) or 0)
            oi_to_mcap_ratio = (total_open_interest / market_cap * 100) if market_cap else 0

            return {
                'total_futures_volume_24h': total_futures_volume,
                'total_perpetual_volume_24h': total_perp_volume,
                'total_open_interest_usd': total_open_interest,
                'open_interest_to_mcap_ratio': round(oi_to_mcap_ratio, 2),
                'avg_basis_percentage': round(avg_basis, 4),
                'avg_funding_rate': round(avg_funding, 6),
                'futures_count': len(futures_tickers),
                'perpetual_count': len(perpetual_tickers),
                'top_futures_exchanges': sorted(
                    futures_tickers,
                    key=lambda x: x['volume_24h'],
                    reverse=True
                )[:5],
                'top_perpetual_exchanges': sorted(
                    perpetual_tickers,
                    key=lambda x: x['volume_24h'],
                    reverse=True
                )[:5],
                'sentiment': sentiment
            }

        except Exception as e:
            print(f"      Error in derivatives analysis: {e}")
            return {}

    def _interpret_derivatives_sentiment(self, basis: float, funding_rate: float) -> Dict:
        """Interpret market sentiment from derivatives metrics"""

        # Analyze basis
        if basis > 0.5:
            basis_signal = "strong_bullish"
            basis_interpretation = "High futures premium indicates strong demand for long positions"
        elif basis > 0.1:
            basis_signal = "bullish"
            basis_interpretation = "Positive basis suggests moderate bullish sentiment"
        elif basis < -0.5:
            basis_signal = "strong_bearish"
            basis_interpretation = "Futures trading at discount indicates bearish positioning"
        elif basis < -0.1:
            basis_signal = "bearish"
            basis_interpretation = "Negative basis suggests moderate bearish sentiment"
        else:
            basis_signal = "neutral"
            basis_interpretation = "Futures trading near spot price"

        # Analyze funding rate
        if funding_rate > 0.01:
            funding_signal = "strong_bullish"
            funding_interpretation = "High positive funding rate shows longs paying shorts - overheated longs"
        elif funding_rate > 0.001:
            funding_signal = "bullish"
            funding_interpretation = "Positive funding indicates more long interest"
        elif funding_rate < -0.01:
            funding_signal = "strong_bearish"
            funding_interpretation = "Negative funding shows shorts paying longs - heavy short positioning"
        elif funding_rate < -0.001:
            funding_signal = "bearish"
            funding_interpretation = "Negative funding indicates more short interest"
        else:
            funding_signal = "neutral"
            funding_interpretation = "Balanced long/short positioning"

        # Combined signal
        signals = {'strong_bullish': 2, 'bullish': 1, 'neutral': 0, 'bearish': -1, 'strong_bearish': -2}
        combined_score = signals.get(basis_signal, 0) + signals.get(funding_signal, 0)

        if combined_score >= 3:
            overall = "strong_bullish"
        elif combined_score >= 1:
            overall = "bullish"
        elif combined_score <= -3:
            overall = "strong_bearish"
        elif combined_score <= -1:
            overall = "bearish"
        else:
            overall = "neutral"

        return {
            'overall': overall,
            'basis_signal': basis_signal,
            'basis_interpretation': basis_interpretation,
            'funding_signal': funding_signal,
            'funding_interpretation': funding_interpretation,
            'combined_score': combined_score
        }

    def _get_funding_rates(self, coin_id: str, market_data: Dict) -> Dict:
        """Get detailed funding rate information"""

        # For now, we'll use data from the market_data
        # In production, you'd call specific exchange APIs (Binance, Bybit, etc.)

        return {
            'latest_rate': 0,  # Would come from exchange API
            'rate_8h': 0,
            'rate_24h': 0,
            'trend': 'stable',
            'interpretation': 'Funding rates indicate balanced market'
        }

    def _analyze_long_short_ratio(self, derivatives_data: Dict) -> Dict:
        """Analyze long/short positioning from derivatives data"""

        avg_basis = derivatives_data.get('avg_basis_percentage', 0)
        avg_funding = derivatives_data.get('avg_funding_rate', 0)

        # Estimate long/short ratio from funding and basis
        # Positive funding = more longs, negative = more shorts
        if avg_funding > 0.01:
            estimated_ratio = 2.0  # 2:1 long:short
            interpretation = "Heavy long positioning"
        elif avg_funding > 0.001:
            estimated_ratio = 1.3
            interpretation = "Moderate long bias"
        elif avg_funding < -0.01:
            estimated_ratio = 0.5  # More shorts
            interpretation = "Heavy short positioning"
        elif avg_funding < -0.001:
            estimated_ratio = 0.7
            interpretation = "Moderate short bias"
        else:
            estimated_ratio = 1.0
            interpretation = "Balanced positioning"

        return {
            'estimated_long_short_ratio': round(estimated_ratio, 2),
            'interpretation': interpretation,
            'signal': 'bullish' if estimated_ratio > 1.2 else ('bearish' if estimated_ratio < 0.8 else 'neutral')
        }

    def _detect_institutional_activity(
        self,
        derivatives_data: Dict,
        funding_data: Dict,
        market_data: Dict
    ) -> Dict:
        """Detect institutional/smart money activity patterns"""

        signals = []
        confidence_score = 0
        overall_direction = 'neutral'

        # Large open interest suggests institutional participation
        oi = derivatives_data.get('total_open_interest_usd', 0)
        oi_ratio = derivatives_data.get('open_interest_to_mcap_ratio', 0)

        if oi_ratio > 10:
            signals.append("High open interest relative to market cap indicates institutional presence")
            confidence_score += 20

        # Analyze volume patterns
        futures_vol = derivatives_data.get('total_futures_volume_24h', 0)
        perp_vol = derivatives_data.get('total_perpetual_volume_24h', 0)
        spot_vol = float(market_data.get('total_volume', {}).get('usd', 0) or 0)

        if futures_vol + perp_vol > spot_vol * 2:
            signals.append("Derivatives volume exceeds spot - institutions likely using leverage")
            confidence_score += 15

        # Analyze basis
        basis = derivatives_data.get('avg_basis_percentage', 0)

        if basis > 0.3:
            signals.append("Positive futures basis suggests institutions building long positions")
            confidence_score += 25
            overall_direction = 'bullish'
        elif basis < -0.3:
            signals.append("Negative basis suggests institutional short positioning or hedging")
            confidence_score += 25
            overall_direction = 'bearish'

        # Funding rate analysis
        funding = derivatives_data.get('avg_funding_rate', 0)

        if funding > 0.01:
            signals.append("Very high funding rate - retail longs may be overextended, watch for institutional fading")
            confidence_score += 20
            if overall_direction == 'bullish':
                signals.append("Conflicting signal: High funding could precede correction")
        elif funding < -0.01:
            signals.append("Negative funding with heavy shorts - potential setup for institutional squeeze")
            confidence_score += 20
            if overall_direction == 'bearish':
                signals.append("Heavy shorts may be overstretched")

        # Price action vs derivatives
        price_change = float(market_data.get('price_change_percentage_24h', 0) or 0)

        if price_change > 5 and oi_ratio > 8:
            signals.append("Price surge with high OI suggests institutional breakout positioning")
            confidence_score += 30
            overall_direction = 'bullish'
        elif price_change < -5 and oi_ratio > 8:
            signals.append("Price drop with high OI could indicate institutional distribution")
            confidence_score += 30
            overall_direction = 'bearish'

        return {
            'signals': signals[:5],  # Top 5 signals
            'confidence_score': min(confidence_score, 100),
            'direction': overall_direction,
            'open_interest_usd': oi,
            'oi_to_mcap_ratio': oi_ratio,
            'institutional_participation': 'high' if oi_ratio > 10 else ('medium' if oi_ratio > 5 else 'low')
        }

    def _evaluate_short_pressure(
        self,
        derivatives_data: Dict,
        market_data: Dict,
        institutional_signals: Dict
    ) -> Dict:
        """Score short pressure intensity and craft Monty's guidance."""

        try:
            funding = float(derivatives_data.get('avg_funding_rate', 0) or 0)
            basis = float(derivatives_data.get('avg_basis_percentage', 0) or 0)
            oi_ratio = float(derivatives_data.get('open_interest_to_mcap_ratio', 0) or 0)
            oi_usd = float(derivatives_data.get('total_open_interest_usd', 0) or 0)
            futures_vol = float(derivatives_data.get('total_futures_volume_24h', 0) or 0)
            perp_vol = float(derivatives_data.get('total_perpetual_volume_24h', 0) or 0)
            spot_vol = float(market_data.get('total_volume', {}).get('usd', 0) or 0)
            price_change = float(market_data.get('price_change_percentage_24h', 0) or 0)

            score = 0
            drivers = []

            # Funding rate (negative funding implies shorts paying longs)
            if funding < -0.015:
                score += 35
                drivers.append("Funding at deeply negative levels – shorts are paying a premium to stay positioned")
            elif funding < -0.005:
                score += 25
                drivers.append("Negative funding indicates shorts dominating perpetual markets")
            elif funding > 0.01:
                score -= 15
                drivers.append("Positive funding shows longs in control, short pressure is muted")

            # Basis impact (discounted futures suggest hedging/shorts)
            if basis < -0.5:
                score += 30
                drivers.append("Futures discount vs. spot highlights aggressive hedging/short demand")
            elif basis < -0.15:
                score += 18
                drivers.append("Negative basis points to a meaningful short bias")
            elif basis > 0.4:
                score -= 10
                drivers.append("Positive basis favors longs; shorts are less active")

            # Open interest context
            if oi_ratio > 12:
                score += 20
                drivers.append("Open interest is massive relative to market cap – institutions likely involved")
            elif oi_ratio > 7:
                score += 12
                drivers.append("Elevated open interest suggests a crowded trade building")

            # Volume skew towards derivatives
            total_deriv_vol = futures_vol + perp_vol
            volume_ratio = (total_deriv_vol / spot_vol) if spot_vol else None
            if volume_ratio and volume_ratio >= 3:
                score += 18
                drivers.append("Derivatives volume is overwhelming spot – leverage is driving the tape")
            elif volume_ratio and volume_ratio >= 1.5:
                score += 10
                drivers.append("Derivatives volume outpacing spot hints at leveraged positioning")

            # Price action confirmation
            if price_change <= -6:
                score += 20
                drivers.append("Sharp price drawdown alongside building shorts – liquidation risk rising")
            elif price_change <= -3:
                score += 12
                drivers.append("Price slippage with shorts leaning in – squeeze fuel accumulating")
            elif price_change >= 4:
                score -= 8
                drivers.append("Price rally despite shorts – squeeze likely already in motion")

            # Institutional signals alignment can amplify conviction
            if institutional_signals.get('direction') == 'bearish':
                score += 8
            elif institutional_signals.get('direction') == 'bullish':
                score -= 6

            score = max(0, min(int(round(score)), 100))

            if score >= 75:
                pressure_level = 'extreme'
            elif score >= 55:
                pressure_level = 'elevated'
            elif score >= 35:
                pressure_level = 'watching'
            else:
                pressure_level = 'muted'

            if pressure_level in ['extreme', 'elevated']:
                squeeze_risk = 'high' if price_change < 2 else 'very_high'
            elif pressure_level == 'watching':
                squeeze_risk = 'moderate'
            else:
                squeeze_risk = 'low'

            if pressure_level in ['extreme', 'elevated']:
                stance = 'buy'
                guidance = (
                    "Monty: Shorts are overcrowded and paying up. Consider building or holding long exposure for a potential "
                    "snap-back rally, but size positions responsibly."
                )
                confidence = min(90, max(40, score))
            elif pressure_level == 'watching':
                stance = 'hold'
                guidance = (
                    "Monty: Shorts are leaning in, but signals are mixed. Maintain core exposure and wait for confirmation "
                    "before adding risk."
                )
                confidence = 55
            else:
                stance = 'sell'
                guidance = (
                    "Monty: Short pressure is muted while longs control funding. Consider trimming or waiting for better "
                    "risk/reward before deploying capital."
                )
                confidence = min(85, max(35, 100 - score))

            return {
                'short_pressure_score': score,
                'pressure_level': pressure_level,
                'short_volume_ratio': round(volume_ratio, 2) if volume_ratio else None,
                'total_short_leverage_usd': total_deriv_vol if funding < 0 else 0,
                'key_drivers': drivers[:5],
                'risk_of_squeeze': squeeze_risk,
                'monty_view': {
                    'stance': stance,
                    'summary': guidance,
                    'confidence': confidence,
                    'supporting_metrics': {
                        'funding_rate': funding,
                        'basis': basis,
                        'open_interest_ratio': oi_ratio,
                        'open_interest_usd': oi_usd
                    }
                }
            }

        except Exception as e:
            print(f"      Error scoring short pressure: {e}")
            return {
                'short_pressure_score': 0,
                'pressure_level': 'unknown',
                'key_drivers': ['Short pressure analysis unavailable'],
                'risk_of_squeeze': 'unknown',
                'monty_view': {
                    'stance': 'hold',
                    'summary': 'Monty: Short positioning data unavailable – keep risk light until fresh data prints.',
                    'confidence': 0,
                    'supporting_metrics': {}
                }
            }

    def get_whale_transactions(self, symbol: str = 'BTC') -> Dict:
        """
        Get whale transaction data
        Note: This is a placeholder for whale transaction monitoring
        In production, you would use:
        - Whale Alert API (https://whale-alert.io/)
        - Blockchain explorers (Etherscan, Blockchain.info)
        - Exchange wallet monitoring
        """

        # Simulated whale activity data structure
        whale_data = {
            'symbol': symbol,
            'timestamp': datetime.now().isoformat(),
            'large_transactions_24h': [],
            'exchange_inflows': {
                'total_usd': 0,
                'transaction_count': 0,
                'interpretation': 'Neutral - no significant exchange inflows detected'
            },
            'exchange_outflows': {
                'total_usd': 0,
                'transaction_count': 0,
                'interpretation': 'Neutral - no significant exchange outflows detected'
            },
            'whale_accumulation_signal': 'neutral',
            'notes': [
                'Whale transaction monitoring requires subscription to Whale Alert API or similar services',
                'Large transactions (>$1M for BTC, >$500K for ETH) would be tracked here',
                'Exchange flows help identify accumulation (outflows) vs distribution (inflows)'
            ]
        }

        return whale_data

    def get_fear_greed_index(self) -> Dict:
        """Get crypto fear & greed index"""
        try:
            response = self.session.get(
                f'{self.alternative_api}/fng/',
                timeout=10
            )

            if response.status_code != 200:
                print(f"  Fear & Greed API unavailable (status {response.status_code}). Using demo data...")
                return self._get_demo_fear_greed()

            data = response.json()
            if not data.get('data'):
                return self._get_demo_fear_greed()

            latest = data['data'][0]
            value = int(latest.get('value', 50))

            return {
                'value': value,
                'classification': latest.get('value_classification', 'Neutral'),
                'timestamp': latest.get('timestamp'),
                'interpretation': self._interpret_fear_greed(value)
            }

        except Exception as e:
            print(f"Error fetching fear & greed index: {e}. Using demo data...")
            return self._get_demo_fear_greed()

    def _get_demo_fear_greed(self) -> Dict:
        """Demo fear & greed data when API is unavailable"""
        return {
            'value': 62,
            'classification': 'Greed',
            'timestamp': datetime.now().isoformat(),
            'interpretation': self._interpret_fear_greed(62),
            '_demo_data': True
        }

    def _get_demo_asset_data(self, asset: str) -> Dict:
        """Provide demo data when API is unavailable"""
        if asset == 'bitcoin':
            return {
                'symbol': 'BTC',
                'current_price': 102000.00,
                'market_cap': 2020000000000,
                'total_volume_24h': 35000000000,
                'price_change_24h': 2.3,
                'derivatives': {
                    'total_open_interest_usd': 15600000000,
                    'open_interest_to_mcap_ratio': 1.16,
                    'avg_basis_percentage': 0.12,
                    'avg_funding_rate': 0.0008,
                    'sentiment': {
                        'overall': 'bullish',
                        'basis_interpretation': 'Positive basis suggests moderate bullish sentiment',
                        'funding_interpretation': 'Positive funding indicates more long interest'
                    }
                },
                'long_short': {
                    'estimated_long_short_ratio': 1.30,
                    'interpretation': 'Moderate long bias',
                    'signal': 'bullish'
                },
                'institutional_signals': {
                    'signals': [
                        'High open interest relative to market cap indicates institutional presence',
                        'Derivatives volume exceeds spot - institutions likely using leverage',
                        'Positive futures basis suggests institutions building long positions'
                    ],
                    'confidence_score': 72,
                    'direction': 'bullish',
                    'institutional_participation': 'high'
                },
                'short_activity': {
                    'short_pressure_score': 62,
                    'pressure_level': 'elevated',
                    'short_volume_ratio': 1.9,
                    'total_short_leverage_usd': 52000000000,
                    'key_drivers': [
                        'Funding near neutral keeps shorts engaged without overheating longs',
                        'Derivatives volume outpacing spot indicates leveraged positioning',
                        'Institutional participation remains high'
                    ],
                    'risk_of_squeeze': 'high',
                    'monty_view': {
                        'stance': 'hold',
                        'summary': 'Monty: Shorts are leaning in but not extreme. Maintain a core position and look for confirmation before adding.',
                        'confidence': 60,
                        'supporting_metrics': {
                            'funding_rate': 0.0008,
                            'basis': 0.12,
                            'open_interest_ratio': 1.16,
                            'open_interest_usd': 15600000000
                        }
                    }
                },
                '_demo_data': True
            }
        else:  # ethereum
            return {
                'symbol': 'ETH',
                'current_price': 3800.00,
                'market_cap': 456000000000,
                'total_volume_24h': 20000000000,
                'price_change_24h': 1.8,
                'derivatives': {
                    'total_open_interest_usd': 8200000000,
                    'open_interest_to_mcap_ratio': 2.60,
                    'avg_basis_percentage': 0.08,
                    'avg_funding_rate': 0.0005,
                    'sentiment': {
                        'overall': 'neutral',
                        'basis_interpretation': 'Positive basis suggests moderate bullish sentiment',
                        'funding_interpretation': 'Positive funding indicates more long interest'
                    }
                },
                'long_short': {
                    'estimated_long_short_ratio': 1.10,
                    'interpretation': 'Slight long bias',
                    'signal': 'neutral'
                },
                'institutional_signals': {
                    'signals': [
                        'High open interest relative to market cap indicates institutional presence',
                        'Balanced positioning suggests wait-and-see approach by institutions'
                    ],
                    'confidence_score': 58,
                    'direction': 'neutral',
                    'institutional_participation': 'medium'
                },
                'short_activity': {
                    'short_pressure_score': 48,
                    'pressure_level': 'watching',
                    'short_volume_ratio': 1.4,
                    'total_short_leverage_usd': 21000000000,
                    'key_drivers': [
                        'Funding slightly positive keeps short bias contained',
                        'Derivatives flow elevated but not extreme',
                        'Price action remains stable despite leverage'
                    ],
                    'risk_of_squeeze': 'moderate',
                    'monty_view': {
                        'stance': 'hold',
                        'summary': 'Monty: Short pressure is building slowly. Stay patient and wait for stronger confirmation before acting.',
                        'confidence': 55,
                        'supporting_metrics': {
                            'funding_rate': 0.0005,
                            'basis': 0.08,
                            'open_interest_ratio': 2.60,
                            'open_interest_usd': 8200000000
                        }
                    }
                },
                '_demo_data': True
            }

    def _interpret_fear_greed(self, value: int) -> str:
        """Interpret fear & greed index value"""
        if value >= 75:
            return "Extreme Greed - Market may be overheated, watch for corrections"
        elif value >= 55:
            return "Greed - Bullish sentiment, but monitor for excess"
        elif value >= 45:
            return "Neutral - Balanced market sentiment"
        elif value >= 25:
            return "Fear - Bearish sentiment, potential buying opportunity"
        else:
            return "Extreme Fear - Market capitulation, strong contrarian buy signal"

    def generate_report(self) -> Dict:
        """Generate comprehensive whale and institutional activity report"""
        print("\n=== Crypto Whale & Institutional Activity Monitor ===\n")

        # Get BTC/ETH futures data
        futures_data = self.get_btc_eth_futures_data()

        # Get fear & greed
        fear_greed = self.get_fear_greed_index()

        # Get whale data for BTC and ETH
        btc_whales = self.get_whale_transactions('BTC')
        eth_whales = self.get_whale_transactions('ETH')

        # Generate summary
        summary = self._generate_summary(futures_data, fear_greed)

        report = {
            'timestamp': datetime.now().isoformat(),
            'futures_analysis': futures_data,
            'whale_activity': {
                'bitcoin': btc_whales,
                'ethereum': eth_whales
            },
            'market_sentiment': fear_greed,
            'summary': summary
        }

        return report

    def _generate_summary(self, futures_data: Dict, fear_greed: Dict) -> Dict:
        """Generate executive summary of findings"""

        key_insights = []

        # Bitcoin insights
        if 'bitcoin' in futures_data and not futures_data['bitcoin'].get('error'):
            btc = futures_data['bitcoin']
            btc_inst = btc.get('institutional_signals', {})
            btc_deriv = btc.get('derivatives', {})

            if btc_inst.get('direction') == 'bullish':
                key_insights.append(f"Bitcoin: Institutional signals bullish (confidence: {btc_inst.get('confidence_score', 0)}%)")
            elif btc_inst.get('direction') == 'bearish':
                key_insights.append(f"Bitcoin: Institutional signals bearish (confidence: {btc_inst.get('confidence_score', 0)}%)")

            if btc_deriv:
                sentiment = btc_deriv.get('sentiment', {})
                if sentiment:
                    key_insights.append(f"Bitcoin derivatives: {sentiment.get('overall', 'neutral').replace('_', ' ').title()}")

            btc_short = btc.get('short_activity', {})
            if btc_short and btc_short.get('pressure_level') in {'extreme', 'elevated'}:
                key_insights.append(
                    f"Bitcoin shorts {btc_short.get('pressure_level', 'elevated')} – Monty leans {btc_short.get('monty_view', {}).get('stance', 'hold').upper()}"
                )

        # Ethereum insights
        if 'ethereum' in futures_data and not futures_data['ethereum'].get('error'):
            eth = futures_data['ethereum']
            eth_inst = eth.get('institutional_signals', {})
            eth_deriv = eth.get('derivatives', {})

            if eth_inst.get('direction') == 'bullish':
                key_insights.append(f"Ethereum: Institutional signals bullish (confidence: {eth_inst.get('confidence_score', 0)}%)")
            elif eth_inst.get('direction') == 'bearish':
                key_insights.append(f"Ethereum: Institutional signals bearish (confidence: {eth_inst.get('confidence_score', 0)}%)")

            if eth_deriv:
                sentiment = eth_deriv.get('sentiment', {})
                if sentiment:
                    key_insights.append(f"Ethereum derivatives: {sentiment.get('overall', 'neutral').replace('_', ' ').title()}")

            eth_short = eth.get('short_activity', {})
            if eth_short and eth_short.get('pressure_level') in {'extreme', 'elevated'}:
                key_insights.append(
                    f"Ethereum shorts {eth_short.get('pressure_level', 'elevated')} – Monty leans {eth_short.get('monty_view', {}).get('stance', 'hold').upper()}"
                )

        # Market sentiment
        if fear_greed:
            key_insights.append(f"Market sentiment: {fear_greed.get('classification', 'Unknown')} ({fear_greed.get('value', 50)})")

        return {
            'key_insights': key_insights,
            'btc_institutional_direction': futures_data.get('bitcoin', {}).get('institutional_signals', {}).get('direction', 'neutral'),
            'eth_institutional_direction': futures_data.get('ethereum', {}).get('institutional_signals', {}).get('direction', 'neutral'),
            'market_regime': fear_greed.get('classification', 'Unknown') if fear_greed else 'Unknown'
        }


def main():
    monitor = CryptoWhaleMonitor()
    report = monitor.generate_report()

    # Output as JSON
    print(json.dumps(report, indent=2))

    return report


if __name__ == "__main__":
    main()
