'use client'

import { useEffect, useState } from 'react'

const MONEY_PHRASES = [
  "Scanning for the big bucks...",
  "Searching for the gold rush...",
  "Digging for oil...",
  "Hunting for hidden gems...",
  "Chasing the green...",
  "Following the money trail...",
  "Sniffing out profits...",
  "Prospecting for gold...",
  "Fishing for whales...",
  "Tracking down tendies...",
  "Mining for opportunities...",
  "Collecting the bag...",
  "Stacking those chips...",
  "Printing money...",
  "Finding the treasure...",
  "Catching the wave...",
  "Striking gold...",
  "Hunting for rockets...",
  "Chasing moonshots...",
  "Seeking alpha...",
]

export function MontyLoading() {
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [currentPhrase, setCurrentPhrase] = useState(MONEY_PHRASES[0])

  useEffect(() => {
    // Rotate phrases every 2 seconds
    const interval = setInterval(() => {
      setCurrentPhrase(MONEY_PHRASES[Math.floor(Math.random() * MONEY_PHRASES.length)])
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="text-center py-16">
      <div className="inline-flex flex-col items-center gap-4">
        {/* Monty Animation - only loads when component is rendered */}
        <div className="relative w-32 h-32">
          {!videoLoaded && (
            // Fallback spinner while video loads
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-900 dark:border-slate-600 dark:border-t-white rounded-full animate-spin"></div>
            </div>
          )}
          <video
            autoPlay
            loop
            muted
            playsInline
            onLoadedData={() => setVideoLoaded(true)}
            className={`w-full h-full object-contain transition-opacity duration-300 ${
              videoLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ pointerEvents: 'none' }}
          >
            {/* Will work once video is added to /public/monty.mp4 */}
            <source src="/monty.mp4" type="video/mp4" />
            {/* Fallback if video fails to load - shows nothing */}
          </video>
        </div>

        <div className="text-slate-600 dark:text-slate-400 font-medium transition-all duration-300">
          {currentPhrase}
        </div>
      </div>
    </div>
  )
}
