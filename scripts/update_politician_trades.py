#!/usr/bin/env python3
"""
Update Politician Trades Script

Scrapes congressional trading data from public sources and stores it in the database.
Designed to run as a scheduled job (e.g., daily via GitHub Actions).
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.scrapers.store_politician_trades import main

if __name__ == "__main__":
    main()
