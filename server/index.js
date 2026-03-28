import cors from 'cors';
import 'dotenv/config';
import express from 'express';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY?.trim();
const MARKET_SNAPSHOT_TTL_MS = 10 * 60 * 1000;

let marketSnapshotCache = null;
let marketSnapshotPromise = null;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    api: 'stocks-for-beginners',
    tinyFishConfigured: Boolean(TINYFISH_API_KEY),
  });
});

app.get('/api/market-snapshot', async (_req, res) => {
  try {
    const snapshot = await getMarketSnapshot();
    res.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    res.status(500).json({
      ok: false,
      message,
    });
  }
});

app.get('/api/analyze', async (req, res) => {
  const rawQuery = typeof req.query.query === 'string' ? req.query.query.trim() : '';

  if (!rawQuery) {
    return res.status(400).json({
      ok: false,
      message: 'Please provide a stock name or ticker.',
    });
  }

  if (!TINYFISH_API_KEY) {
    return res.json({
      ok: false,
      mode: 'config_required',
      query: rawQuery,
      message: 'Add TINYFISH_API_KEY to your .env file to enable live stock summaries.',
      missingKeys: {
        tinyFish: true,
      },
    });
  }

  try {
    const quoteData = await runTinyFishAutomation({
      url: `https://finance.yahoo.com/lookup?s=${encodeURIComponent(rawQuery)}`,
      goal:
        'If the query looks like a stock ticker, open that ticker quote page. If the query is a company name, find the best matching ticker, open the quote page, and extract the current stock price, price change, percent change, market cap, P/E ratio, 52-week range, business summary, company name, sector, industry, and website. Also write a beginner-friendly summary that says why people may like the stock and what risks beginners should know. Return JSON with keys symbol, companyName, price, change, changePercent, marketCap, peRatio, range52Week, summary, beginnerSummary, whyPeopleLikeIt, risks, sector, industry, website.',
    });

    const quote = normalizeQuote(quoteData);
    const symbol = quote.symbol || normalizeSymbol(rawQuery);
    const companyName = quote.companyName || rawQuery;

    res.json({
      ok: true,
      mode: 'live',
      query: rawQuery,
      symbol,
      companyName: quote.companyName || companyName,
      sector: quote.sector || 'Unknown',
      industry: quote.industry || 'Unknown',
      description: quote.summary || '',
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      marketCap: quote.marketCap,
      peRatio: quote.peRatio,
      range52Week: quote.range52Week,
      beginnerSummary: quote.beginnerSummary || quote.summary || '',
      whyPeopleLikeIt: quote.whyPeopleLikeIt,
      risks: quote.risks,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    res.status(500).json({
      ok: false,
      mode: 'error',
      query: rawQuery,
      message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Stock API listening on http://localhost:${PORT}`);
});

async function runTinyFishAutomation({ url, goal }) {
  const response = await fetch('https://agent.tinyfish.ai/v1/automation/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': TINYFISH_API_KEY || '',
    },
    body: JSON.stringify({
      url,
      goal,
      browser_profile: 'lite',
    }),
  });

  if (!response.ok) {
    throw new Error(`TinyFish request failed with status ${response.status}.`);
  }

  const data = await response.json();
  const status = String(data.status || '').toUpperCase();

  if (status === 'FAILED') {
    throw new Error(data.error?.message || 'TinyFish automation failed.');
  }

  if (status && status !== 'COMPLETED') {
    throw new Error(`TinyFish returned unexpected status ${status || 'UNKNOWN'}.`);
  }

  return data.result || data.resultJson || data;
}

async function getMarketSnapshot() {
  const now = Date.now();
  if (marketSnapshotCache && now - marketSnapshotCache.updatedAtMs < MARKET_SNAPSHOT_TTL_MS) {
    return marketSnapshotCache.payload;
  }

  if (marketSnapshotPromise) {
    return marketSnapshotPromise;
  }

  if (!TINYFISH_API_KEY) {
    return {
      ok: false,
      mode: 'config_required',
      message: 'Add TINYFISH_API_KEY to load the market snapshot.',
    };
  }

  marketSnapshotPromise = (async () => {
    const raw = await runTinyFishAutomation({
      url: 'https://www.reuters.com/markets/',
      goal:
        'Extract the current market mood and the latest stock market headlines for the day. Return JSON with keys tone, toneScore, summary, beginnerTakeaway, themes, headlines, and watchList. ' +
        'themes should be an array of objects with keys label, score, note. ' +
        'headlines should be an array of objects with keys title, url, source, published. ' +
        'watchList should be an array of short strings. ' +
        'Keep the tone and summary beginner-friendly and based on the current headlines on the page.',
    });

    const snapshot = normalizeMarketSnapshot(raw);
    const payload = {
      ok: true,
      ...snapshot,
      updatedAt: new Date().toISOString(),
    };

    marketSnapshotCache = {
      updatedAtMs: Date.now(),
      payload,
    };

    return payload;
  })();

  try {
    return await marketSnapshotPromise;
  } finally {
    marketSnapshotPromise = null;
  }
}

function normalizeQuote(raw) {
  const source = unwrapData(raw);

  return {
    symbol: source?.symbol || source?.ticker || '',
    price: toNumber(source?.price),
    change: toNumber(source?.change),
    changePercent: source?.changePercent || source?.change_percent || null,
    marketCap: toNumber(source?.marketCap || source?.market_cap),
    peRatio: toNumber(source?.peRatio || source?.pe_ratio),
    range52Week: source?.range52Week || source?.range_52_week || null,
    summary: source?.summary || source?.description || '',
    beginnerSummary: source?.beginnerSummary || source?.beginner_summary || source?.summary || '',
    whyPeopleLikeIt: normalizeStringList(source?.whyPeopleLikeIt || source?.why_people_like_it),
    risks: normalizeStringList(source?.risks),
    companyName: source?.companyName || source?.name || '',
    sector: source?.sector || '',
    industry: source?.industry || '',
  };
}

function normalizeMarketSnapshot(raw) {
  const source = unwrapData(raw);
  const rawThemes = Array.isArray(source?.themes) ? source.themes : [];
  const rawHeadlines = Array.isArray(source?.headlines) ? source.headlines : [];

  return {
    tone: String(source?.tone || 'Mixed').trim(),
    toneScore: clampNumber(toNumber(source?.toneScore), 0, 100, 55),
    summary: String(source?.summary || source?.beginnerSummary || '').trim(),
    beginnerTakeaway: String(source?.beginnerTakeaway || source?.summary || '').trim(),
    themes: rawThemes
      .map((theme) => ({
        label: String(theme?.label || 'Theme').trim(),
        score: clampNumber(toNumber(theme?.score), 0, 100, 50),
        note: String(theme?.note || '').trim(),
      }))
      .filter((item) => item.label),
    headlines: rawHeadlines
      .map((item) => ({
        title: String(item?.title || '').trim(),
        url: String(item?.url || '').trim(),
        source: String(item?.source || 'Reuters').trim(),
        published: String(item?.published || '').trim(),
      }))
      .filter((item) => item.title),
    watchList: normalizeStringList(source?.watchList || source?.watch_list),
  };
}

function normalizeNews(raw) {
  const source = unwrapData(raw);
  const items = Array.isArray(source) ? source : source?.news || source?.articles || [];

  return items
    .map((item) => ({
      title: item.title || 'Untitled headline',
      url: item.url || item.link || '',
      source: item.source || item.publisher || 'Unknown source',
      published: item.published || item.date || '',
    }))
    .filter((item) => item.title);
}

function normalizeFilings(raw) {
  const source = unwrapData(raw);
  const items = Array.isArray(source) ? source : source?.filings || source?.results || [];

  return items
    .map((item) => ({
      title: item.title || item.formType || 'SEC filing',
      date: item.date || item.filed || '',
      url: item.url || '',
      formType: item.formType || item.form || '',
    }))
    .filter((item) => item.title);
}

function normalizeSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, '');
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((item) => item.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }

  return [];
}

function clampNumber(value, min, max, fallback) {
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, safeValue));
}

function looksLikeSymbol(value) {
  return /^[A-Z0-9.\-]{1,8}$/.test(value) && !value.includes(' ');
}

function unwrapData(raw) {
  if (!raw) return raw;
  return raw.resultJson || raw.result || raw.data || raw;
}

function parsePercent(value) {
  const parsed = Number(String(value).replace('%', ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
