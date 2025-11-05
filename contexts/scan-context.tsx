'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface ScanContextType {
  opportunities: unknown[]
  scanType?: string
  setScanResults: (opportunities: unknown[], scanType?: string) => void
  clearScanResults: () => void
}

const ScanContext = createContext<ScanContextType | undefined>(undefined)

export function ScanProvider({ children }: { children: ReactNode }) {
  const [opportunities, setOpportunities] = useState<unknown[]>([])
  const [scanType, setScanType] = useState<string | undefined>(undefined)

  const setScanResults = (newOpportunities: unknown[], newScanType?: string) => {
    setOpportunities(newOpportunities)
    setScanType(newScanType)
  }

  const clearScanResults = () => {
    setOpportunities([])
    setScanType(undefined)
  }

  return (
    <ScanContext.Provider value={{ opportunities, scanType, setScanResults, clearScanResults }}>
      {children}
    </ScanContext.Provider>
  )
}

export function useScanContext() {
  const context = useContext(ScanContext)
  if (context === undefined) {
    throw new Error('useScanContext must be used within a ScanProvider')
  }
  return context
}
