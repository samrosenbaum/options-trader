'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'

interface FeatureOverview {
  title: string
  description: string
  media: string
}

interface Feature {
  title: string
  description: string
  media: string
  accent: string
  glow: string
}

interface FeatureSplitCardsProps {
  overview: FeatureOverview
  features: Feature[]
}

export default function FeatureSplitCards({ overview, features }: FeatureSplitCardsProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="relative mx-auto w-full max-w-6xl px-6 py-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative flex min-h-[600px] items-start justify-center">
        {/* Single overview card that splits into three */}
        <div className="relative w-full">
          {features.map((feature, index) => {
            // Calculate dimensions
            const cardWidth = 360 // Each card is ~360px when split
            const gap = 32 // 32px gap between cards
            const totalWidth = cardWidth * 3 + gap * 2 // Total width: 1144px

            // Starting position for each card (all centered)
            // When split, cards move to left, center, right positions
            const endX = (index - 1) * (cardWidth + gap) // -392, 0, 392

            return (
              <motion.div
                key={feature.title}
                initial={false}
                animate={{
                  x: isHovered ? endX - cardWidth / 2 : -totalWidth / 2,
                  width: isHovered ? cardWidth : totalWidth,
                  opacity: isHovered ? 1 : (index === 1 ? 1 : 0),
                }}
                transition={{
                  type: 'spring',
                  stiffness: 200,
                  damping: 30,
                  mass: 0.8,
                }}
                style={{
                  left: '50%',
                }}
                className="absolute top-0"
              >
                <div className="group relative h-full overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-[0_35px_60px_-25px_rgba(0,0,0,0.15)]">
                  {/* Media container */}
                  <motion.div
                    animate={{
                      height: isHovered ? 320 : 420,
                    }}
                    transition={{
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                    }}
                    className="relative overflow-hidden"
                  >
                    {/* Placeholder background with icon */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 via-blue-50 to-purple-50" />
                    <div
                      className={`absolute inset-0 ${feature.glow} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
                    />

                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.div
                        animate={{
                          fontSize: isHovered ? 64 : 96,
                        }}
                        transition={{
                          type: 'spring',
                          stiffness: 200,
                          damping: 30,
                        }}
                        className="opacity-30"
                      >
                        {index === 0 ? '🔍' : index === 1 ? '📈' : '💬'}
                      </motion.div>
                    </div>

                    {/* Accent badge */}
                    <div className="absolute right-4 top-4">
                      <div className={`h-3 w-3 rounded-full ${feature.accent} shadow-lg`} />
                    </div>

                    {/* Title overlay - visible in single card mode */}
                    <motion.div
                      animate={{
                        opacity: isHovered ? 0 : 1,
                      }}
                      transition={{
                        duration: 0.3,
                      }}
                      className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/95 via-white/90 to-white/80"
                    >
                      <div className="text-center">
                        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-gray-500">
                          {overview.title}
                        </p>
                        <p className="mt-6 max-w-2xl px-12 text-xl text-gray-700">
                          {overview.description}
                        </p>
                      </div>
                    </motion.div>
                  </motion.div>

                  {/* Content - fades in when cards split */}
                  <motion.div
                    animate={{
                      opacity: isHovered ? 1 : 0,
                    }}
                    transition={{
                      duration: 0.3,
                      delay: isHovered ? 0.2 : 0,
                    }}
                    className="space-y-3 p-6"
                  >
                    <h3 className="text-xl font-semibold text-gray-900">{feature.title}</h3>
                    <p className="text-sm text-gray-600">{feature.description}</p>
                  </motion.div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
