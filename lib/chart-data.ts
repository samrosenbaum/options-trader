export const generatePriceHistory = (symbol: string, currentPrice: number, days = 30) => {
  const data = []
  let price = currentPrice * 0.9 // Start 10% lower
  const volatility = 0.02

  for (let i = 0; i < days; i++) {
    const change = (Math.random() - 0.5) * volatility * price
    price += change
    data.push({
      date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      price: Number.parseFloat(price.toFixed(2)),
      volume: Math.floor(Math.random() * 50000000) + 10000000,
    })
  }

  return data
}

export const generateOptionsVolumeData = () => {
  return [
    { name: "AAPL", calls: 145000, puts: 98000 },
    { name: "NVDA", calls: 132000, puts: 115000 },
    { name: "TSLA", calls: 198000, puts: 156000 },
    { name: "MSFT", calls: 87000, puts: 62000 },
    { name: "AMZN", calls: 76000, puts: 54000 },
  ]
}

export const generatePortfolioPerformance = () => {
  const data = []
  let value = 10000

  for (let i = 0; i < 12; i++) {
    const change = (Math.random() - 0.3) * 500 // Slight upward bias
    value += change
    data.push({
      month: new Date(Date.now() - (12 - i) * 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
        month: "short",
      }),
      value: Number.parseFloat(value.toFixed(2)),
    })
  }

  return data
}

export const generateImpliedVolatility = () => {
  return [
    { strike: 160, iv: 0.28 },
    { strike: 165, iv: 0.26 },
    { strike: 170, iv: 0.24 },
    { strike: 175, iv: 0.23 },
    { strike: 180, iv: 0.22 },
    { strike: 185, iv: 0.23 },
    { strike: 190, iv: 0.25 },
    { strike: 195, iv: 0.27 },
    { strike: 200, iv: 0.3 },
  ]
}
