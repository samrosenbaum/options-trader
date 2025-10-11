#!/usr/bin/env python3
"""
Quick test script to verify the enhanced scanner is working
"""

import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
sys.path.insert(0, os.path.dirname(__file__))

try:
    from src.scanner.enhanced_service import InstitutionalOptionsScanner
    print("✅ Successfully imported InstitutionalOptionsScanner")
    
    # Try to initialize the scanner
    scanner = InstitutionalOptionsScanner(max_symbols=5)
    print("✅ Successfully initialized enhanced scanner")
    
    # Test enhanced components imports
    from src.validation.data_quality import DataQuality
    from src.math.probability import ProbabilityCalculator
    from src.math.greeks import GreeksCalculator
    print("✅ All enhanced components imported successfully")
    
    print("🚀 Enhanced scanner is ready for testing!")
    
except ImportError as e:
    print(f"❌ Import error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)