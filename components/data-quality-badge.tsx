import { DataQualityInfo } from '@/lib/types/opportunity'
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react'

interface DataQualityBadgeProps {
  quality: DataQualityInfo
  compact?: boolean
}

export function DataQualityBadge({ quality, compact = false }: DataQualityBadgeProps) {
  const getQualityColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'medium':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      case 'low':
        return 'bg-orange-50 text-orange-700 border-orange-200'
      case 'rejected':
        return 'bg-red-50 text-red-700 border-red-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const getQualityIcon = (level: string) => {
    switch (level) {
      case 'high':
        return <CheckCircle className="h-4 w-4" />
      case 'medium':
        return <Info className="h-4 w-4" />
      case 'low':
        return <AlertTriangle className="h-4 w-4" />
      case 'rejected':
        return <XCircle className="h-4 w-4" />
      default:
        return <Info className="h-4 w-4" />
    }
  }

  const formatPriceAge = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return 'unknown age'
    if (seconds < 60) return `${Math.round(seconds)}s old`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m old`
    return `${Math.round(seconds / 3600)}h old`
  }

  const hasWarnings = quality.warnings.length > 0
  const hasIssues = quality.issues.length > 0

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border ${getQualityColor(quality.quality)}`}>
        {getQualityIcon(quality.quality)}
        <span className="font-medium capitalize">{quality.quality}</span>
        {(hasWarnings || hasIssues) && (
          <span className="ml-1">
            ({hasIssues ? quality.issues.length : quality.warnings.length})
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={`rounded-lg border p-3 ${getQualityColor(quality.quality)}`}>
      <div className="flex items-center gap-2 mb-2">
        {getQualityIcon(quality.quality)}
        <div>
          <h4 className="text-sm font-semibold capitalize">
            Data Quality: {quality.quality}
          </h4>
          <p className="text-xs opacity-75">
            Score: {quality.score.toFixed(0)}/100
          </p>
        </div>
      </div>

      {/* Price Source Info */}
      <div className="text-xs space-y-1 mb-2">
        <div className="flex justify-between">
          <span className="opacity-75">Price Source:</span>
          <span className="font-mono">{quality.priceSource}</span>
        </div>
        {quality.priceAgeSeconds !== null && (
          <div className="flex justify-between">
            <span className="opacity-75">Price Age:</span>
            <span className="font-mono">{formatPriceAge(quality.priceAgeSeconds)}</span>
          </div>
        )}
      </div>

      {/* Issues */}
      {hasIssues && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-semibold">⚠️ Issues:</p>
          <ul className="text-xs space-y-0.5 list-disc list-inside">
            {quality.issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-semibold">ℹ️ Warnings:</p>
          <ul className="text-xs space-y-0.5 list-disc list-inside">
            {quality.warnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
