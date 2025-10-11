#!/usr/bin/env python3
"""
Simple import test to isolate the union type issue
"""

import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
sys.path.insert(0, os.path.dirname(__file__))

try:
    print("Testing basic imports...")
    
    # Test data quality imports
    from src.validation.data_quality import DataQuality, OptionsDataValidator
    print("✅ Data quality imports successful")
    
    # Test math imports
    from src.math.probability import ProbabilityCalculator
    print("✅ Probability calculator import successful") 
    
    from src.math.greeks import GreeksCalculator
    print("✅ Greeks calculator import successful")
    
    # Test integration import
    from src.integration.enhanced_scanner import EnhancedOptionsScanner
    print("✅ Enhanced scanner integration import successful")
    
    print("🚀 All core imports successful!")
    
except ImportError as e:
    print(f"❌ Import error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)