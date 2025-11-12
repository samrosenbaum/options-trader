import type { RobinhoodContext } from '../shared/types';

/**
 * Robinhood DOM Reader
 * Extracts trading data from Robinhood's web interface
 */

export class RobinhoodReader {
  private observer: MutationObserver | null = null;
  private lastContext: RobinhoodContext | null = null;
  private contextChangeCallbacks: ((context: RobinhoodContext) => void)[] = [];

  constructor() {
    this.startObserving();
  }

  /**
   * Start observing DOM changes to detect page updates
   */
  private startObserving() {
    this.observer = new MutationObserver(() => {
      const newContext = this.extractContext();

      // Only notify if context changed
      if (JSON.stringify(newContext) !== JSON.stringify(this.lastContext)) {
        this.lastContext = newContext;
        this.notifyContextChange(newContext);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Register a callback for context changes
   */
  onContextChange(callback: (context: RobinhoodContext) => void) {
    this.contextChangeCallbacks.push(callback);
  }

  /**
   * Notify all callbacks of context change
   */
  private notifyContextChange(context: RobinhoodContext) {
    this.contextChangeCallbacks.forEach(cb => cb(context));
  }

  /**
   * Get current Robinhood context
   */
  getCurrentContext(): RobinhoodContext {
    return this.extractContext();
  }

  /**
   * Extract context from current page
   */
  private extractContext(): RobinhoodContext {
    const url = window.location.href;
    const context: RobinhoodContext = {};

    // Detect page type and extract ticker
    if (url.includes('/stocks/')) {
      context.pageType = 'stock';
      context.ticker = this.extractStockTicker();
      context.currentPrice = this.extractStockPrice();
    } else if (url.includes('/options/')) {
      context.pageType = 'option';
      context.ticker = this.extractOptionTicker();
      context.optionData = this.extractOptionData();
    } else if (url.includes('/account')) {
      context.pageType = 'portfolio';
    } else {
      context.pageType = 'other';
    }

    return context;
  }

  /**
   * Extract stock ticker from URL or page
   */
  private extractStockTicker(): string | undefined {
    // Try URL first
    const urlMatch = window.location.pathname.match(/\/stocks\/([A-Z]+)/i);
    if (urlMatch) {
      return urlMatch[1].toUpperCase();
    }

    // Try page title
    const titleMatch = document.title.match(/^([A-Z]+)/);
    if (titleMatch) {
      return titleMatch[1];
    }

    // Try to find ticker in header or main content
    // Robinhood typically displays the ticker prominently
    const headers = document.querySelectorAll('h1, h2, [data-testid*="ticker"]');
    for (const header of headers) {
      const text = header.textContent?.trim();
      if (text && /^[A-Z]{1,5}$/.test(text)) {
        return text;
      }
    }

    return undefined;
  }

  /**
   * Extract current stock price
   */
  private extractStockPrice(): number | undefined {
    // Look for price elements - Robinhood typically uses specific classes
    // This is a best-effort approach as Robinhood's DOM structure may change

    // Try common price selectors
    const priceSelectors = [
      '[data-testid="last-price"]',
      '[class*="price"]',
      'span[class*="Price"]',
    ];

    for (const selector of priceSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent?.trim();
        if (text) {
          const priceMatch = text.match(/\$?([\d,]+\.?\d*)/);
          if (priceMatch) {
            const price = parseFloat(priceMatch[1].replace(/,/g, ''));
            if (!isNaN(price) && price > 0) {
              return price;
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Extract option ticker
   */
  private extractOptionTicker(): string | undefined {
    // Options URLs typically include the underlying ticker
    const urlMatch = window.location.pathname.match(/\/options\/([A-Z]+)/i);
    if (urlMatch) {
      return urlMatch[1].toUpperCase();
    }

    return this.extractStockTicker();
  }

  /**
   * Extract option-specific data
   */
  private extractOptionData() {
    const optionData: RobinhoodContext['optionData'] = {};

    // Extract from URL if possible
    // Robinhood option URLs might look like: /options/AAPL/2024-01-19/170/call
    const urlParts = window.location.pathname.split('/');

    if (urlParts.includes('options')) {
      const optionsIndex = urlParts.indexOf('options');

      // Try to extract expiration (format: YYYY-MM-DD)
      const expirationMatch = urlParts.find(part => /^\d{4}-\d{2}-\d{2}$/.test(part));
      if (expirationMatch) {
        optionData.expiration = expirationMatch;
      }

      // Try to extract strike
      const strikeMatch = urlParts.find(part => /^\d+(\.\d+)?$/.test(part));
      if (strikeMatch) {
        optionData.strike = parseFloat(strikeMatch);
      }

      // Try to extract type (call/put)
      const typeMatch = urlParts.find(part => /^(call|put)$/i.test(part));
      if (typeMatch) {
        optionData.type = typeMatch.toLowerCase() as 'call' | 'put';
      }
    }

    // Try to extract Greeks and other data from page
    this.extractGreeks(optionData);
    this.extractOptionPrices(optionData);

    return Object.keys(optionData).length > 0 ? optionData : undefined;
  }

  /**
   * Extract Greeks from option page
   */
  private extractGreeks(optionData: NonNullable<RobinhoodContext['optionData']>) {
    // Look for Greek labels and values
    const greekLabels = {
      delta: /delta/i,
      theta: /theta/i,
      gamma: /gamma/i,
      vega: /vega/i,
      iv: /(?:implied\s+volatility|iv)/i,
    };

    // Scan for Greek values in the DOM
    const allText = document.body.innerText;

    Object.entries(greekLabels).forEach(([greek, pattern]) => {
      const match = allText.match(new RegExp(`${pattern.source}\\s*:?\\s*(-?[\\d.]+%?)`, 'i'));
      if (match && match[1]) {
        let value = parseFloat(match[1].replace('%', ''));

        // Convert percentage to decimal for IV
        if (greek === 'iv' && match[1].includes('%')) {
          value = value / 100;
        }

        if (!isNaN(value)) {
          (optionData as any)[greek] = value;
        }
      }
    });
  }

  /**
   * Extract option bid/ask prices
   */
  private extractOptionPrices(optionData: NonNullable<RobinhoodContext['optionData']>) {
    // Look for bid/ask prices
    const pricePattern = /\$?([\d.]+)/;

    // Try to find bid/ask elements
    const labels = document.querySelectorAll('*');
    let foundBid = false;
    let foundAsk = false;

    for (const label of labels) {
      const text = label.textContent?.toLowerCase() || '';

      if (!foundBid && text.includes('bid')) {
        const nextElement = label.nextElementSibling;
        if (nextElement) {
          const match = nextElement.textContent?.match(pricePattern);
          if (match) {
            optionData.bid = parseFloat(match[1]);
            foundBid = true;
          }
        }
      }

      if (!foundAsk && text.includes('ask')) {
        const nextElement = label.nextElementSibling;
        if (nextElement) {
          const match = nextElement.textContent?.match(pricePattern);
          if (match) {
            optionData.ask = parseFloat(match[1]);
            foundAsk = true;
          }
        }
      }

      if (foundBid && foundAsk) break;
    }
  }

  /**
   * Stop observing
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.contextChangeCallbacks = [];
  }
}

// Export singleton instance
export const robinhoodReader = new RobinhoodReader();
