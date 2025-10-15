import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
import json
import re
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.analysis.news_sentiment import detect_macro_events

def analyze_sentiment(text):
    """Enhanced sentiment analysis with options-specific keywords"""
    text_lower = text.lower()
    
    # Enhanced bullish keywords including options-specific terms
    bullish_words = [
        # General bullish
        'surge', 'rally', 'gain', 'profit', 'growth', 'beat', 'exceed',
        'strong', 'positive', 'upgrade', 'buy', 'bullish', 'soar', 'jump',
        'rise', 'increase', 'record', 'high', 'outperform', 'momentum',
        'breakthrough', 'breakout', 'squeeze', 'short squeeze', 'gamma squeeze',
        'unusual activity', 'block trade', 'institutional', 'hedge fund',
        'catalyst', 'earnings beat', 'guidance raise', 'buyback', 'dividend',
        'acquisition', 'merger', 'partnership', 'contract', 'approval'
    ]
    
    # Enhanced bearish keywords
    bearish_words = [
        # General bearish
        'fall', 'drop', 'loss', 'decline', 'weak', 'negative', 'downgrade',
        'sell', 'bearish', 'plunge', 'crash', 'miss', 'disappoint', 'concern',
        'risk', 'low', 'underperform', 'warning', 'cut', 'reduce',
        'bankruptcy', 'default', 'investigation', 'lawsuit', 'regulatory',
        'competition', 'threat', 'headwind', 'challenge', 'struggle',
        'layoff', 'restructure', 'delisting', 'delinquency'
    ]
    
    # Options-specific sentiment indicators
    options_bullish = [
        'call volume', 'put/call ratio low', 'unusual call activity',
        'max pain below', 'gamma exposure', 'delta hedging'
    ]
    
    options_bearish = [
        'put volume', 'put/call ratio high', 'unusual put activity',
        'max pain above', 'put protection', 'hedge activity'
    ]
    
    score = 0
    
    # Count general sentiment words
    for word in bullish_words:
        if word in text_lower:
            score += 1
    
    for word in bearish_words:
        if word in text_lower:
            score -= 1
    
    # Add options-specific scoring
    for phrase in options_bullish:
        if phrase in text_lower:
            score += 2
    
    for phrase in options_bearish:
        if phrase in text_lower:
            score -= 2
    
    # Enhanced scoring based on intensity words
    intensity_words = ['massive', 'extreme', 'unprecedented', 'historic', 'record']
    for word in intensity_words:
        if word in text_lower:
            score *= 1.5  # Amplify sentiment if intensity words present
    
    # Normalize to -1 to 1
    normalized_score = max(-1, min(1, score / 8))
    
    if normalized_score > 0.3:
        label = 'very_bullish'
    elif normalized_score > 0.1:
        label = 'bullish'
    elif normalized_score < -0.3:
        label = 'very_bearish'
    elif normalized_score < -0.1:
        label = 'bearish'
    else:
        label = 'neutral'
    
    return {
        'score': round(normalized_score, 2),
        'label': label,
        'intensity': 'high' if abs(normalized_score) > 0.5 else 'medium' if abs(normalized_score) > 0.2 else 'low'
    }

def get_political_keywords():
    """Get political and regulatory keywords that move markets"""
    return [
        # Political figures
        'biden', 'trump', 'harris', 'pence', 'pelosi', 'mcconnell', 'schumer',
        'yellen', 'powell', 'gensler', 'warren', 'sanders', 'aoc', 'ted cruz',
        
        # Government agencies
        'sec', 'fda', 'fcc', 'ftc', 'doj', 'treasury', 'federal reserve',
        'congress', 'senate', 'house', 'white house', 'pentagon', 'cia', 'fbi',
        
        # Regulatory terms
        'regulation', 'regulatory', 'antitrust', 'investigation', 'lawsuit',
        'subpoena', 'hearing', 'testimony', 'oversight', 'compliance',
        'policy', 'legislation', 'bill', 'act', 'amendment', 'veto',
        
        # Political actions
        'executive order', 'presidential', 'congressional', 'bipartisan',
        'stimulus', 'infrastructure', 'tax reform', 'trade war', 'tariffs',
        'sanctions', 'embargo', 'diplomatic', 'treaty', 'agreement',
        
        # Market-moving events
        'earnings call', 'guidance', 'outlook', 'forecast', 'upgrade',
        'downgrade', 'analyst', 'rating', 'target price', 'consensus',
        'beat', 'miss', 'exceed', 'surprise', 'disappoint'
    ]

def get_political_news():
    """Fetch political and regulatory news that affects markets"""
    try:
        # Search for political news using multiple sources
        import requests
        from bs4 import BeautifulSoup
        
        political_news = []
        
        # Add more comprehensive news sources
        sources = [
            'https://feeds.finance.yahoo.com/rss/2.0/headline',
            'https://feeds.marketwatch.com/marketwatch/topstories/',
            'https://feeds.bloomberg.com/markets/news.rss'
        ]
        
        for source in sources:
            try:
                response = requests.get(source, timeout=10)
                if response.status_code == 200:
                    # Parse RSS feed
                    from xml.etree import ElementTree as ET
                    root = ET.fromstring(response.content)
                    
                    for item in root.findall('.//item')[:10]:
                        title = item.find('title')
                        description = item.find('description')
                        link = item.find('link')
                        pub_date = item.find('pubDate')
                        
                        if title is not None:
                            title_text = title.text or ''
                            desc_text = description.text if description is not None else ''
                            
                            # Check for political keywords
                            content = (title_text + ' ' + desc_text).lower()
                            political_keywords = get_political_keywords()
                            
                            if any(keyword in content for keyword in political_keywords):
                                sentiment = analyze_sentiment(title_text + ' ' + desc_text)
                                macro_events = detect_macro_events(title_text + ' ' + desc_text)

                                political_news.append({
                                    'id': str(hash(title_text)),
                                    'headline': title_text,
                                    'summary': desc_text[:300],
                                    'source': 'Political News',
                                    'url': link.text if link is not None else '',
                                    'datetime': int(datetime.now().timestamp()),
                                    'related': ['POLITICAL'],
                                    'sentiment': sentiment,
                                    'category': 'political',
                                    'macro_events': macro_events if macro_events else []
                                })
            except Exception as e:
                print(f"Error fetching from {source}: {e}")
                continue
        
        return political_news[:20]  # Top 20 political news items
        
    except Exception as e:
        print(f"Error fetching political news: {e}")
        return []

def get_stock_news(symbols):
    """Fetch news for multiple symbols with enhanced analysis"""
    all_news = []
    
    # Add political news
    political_news = get_political_news()
    all_news.extend(political_news)
    
    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            news = ticker.news
            
            if not news:
                continue
            
            for item in news[:5]:  # Top 5 news per symbol
                title_text = item.get('title', '')
                summary_text = item.get('summary', '')
                full_text = title_text + ' ' + summary_text

                sentiment = analyze_sentiment(full_text)
                macro_events = detect_macro_events(full_text)

                # Determine news category
                content = full_text.lower()
                category = 'general'

                if any(word in content for word in ['earnings', 'quarterly', 'guidance', 'forecast']):
                    category = 'earnings'
                elif any(word in content for word in ['merger', 'acquisition', 'buyout', 'deal']):
                    category = 'm&a'
                elif any(word in content for word in ['fda', 'approval', 'trial', 'clinical']):
                    category = 'regulatory'
                elif any(word in content for word in ['insider', 'buy', 'sell', 'shares']):
                    category = 'insider'
                elif any(word in content for word in get_political_keywords()):
                    category = 'political'

                news_item = {
                    'id': item.get('uuid', str(hash(item.get('title', '')))),
                    'headline': title_text if title_text else 'No title',
                    'summary': summary_text[:200],
                    'source': item.get('publisher', 'Unknown'),
                    'url': item.get('link', ''),
                    'datetime': item.get('providerPublishTime', int(datetime.now().timestamp())),
                    'related': [symbol],
                    'sentiment': sentiment,
                    'category': category,
                    'impact_score': calculate_news_impact(content, sentiment),
                    'macro_events': macro_events if macro_events else []
                }
                all_news.append(news_item)
                
        except Exception as e:
            print(f"Error fetching news for {symbol}: {e}")
            continue
    
    # Sort by impact score and datetime
    all_news.sort(key=lambda x: (x.get('impact_score', 0), x['datetime']), reverse=True)
    
    # Remove duplicates based on headline
    seen_headlines = set()
    unique_news = []
    for item in all_news:
        if item['headline'] not in seen_headlines:
            seen_headlines.add(item['headline'])
            unique_news.append(item)
    
    return unique_news[:40]  # Top 40 news items

def calculate_news_impact(content, sentiment):
    """Calculate the potential market impact of news"""
    impact_score = 0
    
    # High-impact keywords
    high_impact = [
        'breaking', 'urgent', 'alert', 'emergency', 'crisis', 'scandal',
        'bankruptcy', 'default', 'merger', 'acquisition', 'buyout',
        'earnings', 'guidance', 'forecast', 'upgrade', 'downgrade',
        'fda approval', 'regulatory', 'investigation', 'lawsuit'
    ]
    
    # Political impact keywords
    political_impact = [
        'executive order', 'congressional', 'senate', 'house', 'president',
        'stimulus', 'infrastructure', 'tax', 'tariff', 'sanctions'
    ]
    
    # Check for high-impact keywords
    for keyword in high_impact:
        if keyword in content.lower():
            impact_score += 3
    
    # Check for political keywords
    for keyword in political_impact:
        if keyword in content.lower():
            impact_score += 2
    
    # Boost score based on sentiment intensity
    if abs(sentiment['score']) > 0.7:
        impact_score += 2
    elif abs(sentiment['score']) > 0.4:
        impact_score += 1
    
    return impact_score

if __name__ == "__main__":
    WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "AMD", "NFLX", "SPY"]
    
    print("Fetching market news...")
    news = get_stock_news(WATCHLIST)
    
    print(json.dumps(news, indent=2))
