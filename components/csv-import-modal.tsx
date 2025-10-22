'use client'

import { useState, useRef } from 'react'
import { X, Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react'

interface CSVImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportSuccess: () => void
}

export default function CSVImportModal({
  isOpen,
  onClose,
  onImportSuccess,
}: CSVImportModalProps) {
  const [csvText, setCsvText] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setCsvText(text)
      setError(null)
      setSuccess(null)
    }
    reader.onerror = () => {
      setError('Failed to read file')
    }
    reader.readAsText(file)
  }

  const handleUpload = async () => {
    if (!csvText.trim()) {
      setError('Please select a CSV file or paste CSV text')
      return
    }

    setIsUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/portfolio/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to import positions')
        return
      }

      setSuccess(data.message || `Imported ${data.imported} positions`)
      setCsvText('')

      // Close modal and refresh after 2 seconds
      setTimeout(() => {
        onImportSuccess()
        onClose()
      }, 2000)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload CSV')
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    if (!isUploading) {
      setCsvText('')
      setError(null)
      setSuccess(null)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-3">
            <Upload className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Import Positions from CSV
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Upload your Robinhood or broker CSV to bulk import positions
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* CSV Format Info */}
          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  CSV Format (Required Columns):
                </p>
                <ul className="space-y-1 text-blue-800 dark:text-blue-200">
                  <li>• <strong>Symbol</strong> - Stock ticker (e.g., HOOD)</li>
                  <li>• <strong>Type</strong> - Call or Put</li>
                  <li>• <strong>Strike</strong> - Strike price (e.g., 135.00)</li>
                  <li>• <strong>Expiration</strong> - Date (e.g., 2025-10-26)</li>
                  <li>• <strong>Quantity</strong> - Number of contracts</li>
                  <li>• <strong>Entry Price</strong> - Price per share (e.g., 2.10)</li>
                </ul>
                <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                  Optional: Entry Date, Notes. Column names are flexible (e.g., &quot;Contracts&quot; = &quot;Quantity&quot;)
                </p>
              </div>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Upload CSV File
            </label>
            <div className="flex gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Choose CSV File
              </button>
            </div>
          </div>

          {/* Or Paste Text */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Or Paste CSV Text
            </label>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Symbol,Type,Strike,Expiration,Quantity,Entry Price
HOOD,Put,135.00,2025-10-26,1,2.10
TSLA,Call,250.00,2025-11-15,2,5.50"
              disabled={isUploading}
              className="w-full h-32 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div className="text-sm text-red-800 dark:text-red-200">
                  <p className="font-semibold mb-1">Import Failed</p>
                  <p>{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="text-sm text-green-800 dark:text-green-200">
                  <p className="font-semibold mb-1">Success!</p>
                  <p>{success}</p>
                  <p className="text-xs mt-1">Closing in 2 seconds...</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 p-6">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={isUploading || !csvText.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import Positions
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
