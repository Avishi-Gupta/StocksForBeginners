# StocksForBeginners

Beginner-friendly stock assistant starter built with React, Vite, TinyFish, and a small Node API.

## Setup

1. Install dependencies:
```bash
npm install
```
Make sure Node.js 20 or newer is installed first.

2. Create a `.env` file in the project root:
```bash
TINYFISH_API_KEY=your_tinyfish_key
PORT=8787
```

3. Start the app:
```bash
npm run dev
```

The frontend runs on Vite and proxies `/api/*` requests to the local API server.

## What it does

- Accepts a stock name or ticker
- Uses TinyFish to scrape public stock, news, and filing pages
- Builds a simple beginner summary with risks, basics, and recent headlines
