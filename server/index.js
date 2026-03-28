import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY?.trim();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-5.2';
const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT?.trim() || 'medium';
const TINYFISH_POLL_ATTEMPTS = Number(process.env.TINYFISH_POLL_ATTEMPTS || 60);
const TINYFISH_POLL_INTERVAL_MS = Number(process.env.TINYFISH_POLL_INTERVAL_MS || 2000);

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    api: 'stocks-for-beginners',
    tinyFishConfigured: Boolean(TINYFISH_API_KEY),
    openAiConfigured: Boolean(OPENAI_API_KEY),
  });
});

app.get('/api/analyze', async (req, res) => {
  const rawQuery = typeof req.query.query === 'string' ? req.query.query.trim() : '';

  if (!rawQuery) {
    return res.status(400).json({
      ok: false,
      message: 'Please provide a stock name or ticker.',
    });
  }

  if (!TINYFISH_API_KEY || !OPENAI_API_KEY) {
    return res.json({
      ok: false,
      mode: 'config_required',
      query: rawQuery,
      message:
        'Add TINYFISH_API_KEY and OPENAI_API_KEY to your .env file to enable live stock summaries.',
      missingKeys: {
        tinyFish: !TINYFISH_API_KEY,
        openAI: !OPENAI_API_KEY,
      },
      links: buildLinks(rawQuery, rawQuery.toUpperCase()),
    });
  }

  try {
    const resolved = await resolveTicker(rawQuery);
    const symbol = resolved.symbol || rawQuery.toUpperCase();
    const companyName = resolved.companyName || rawQuery;

    const [quoteData, newsData, secData] = await Promise.all([
      runTinyFishAutomation({
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
        goal:
          'Extract the current stock price, price change, percent change, volume, market cap, P/E ratio, 52-week range, and short business summary. Return JSON with keys price, change, changePercent, volume, marketCap, peRatio, range52Week, summary, companyName, sector, industry, website.',
      }),
      runTinyFishAutomation({
        url: `https://news.google.com/search?q=${encodeURIComponent(`${companyName} ${symbol} stock`)}`,
        goal:
          'Extract the 5 most recent relevant headlines for this stock. Return JSON array with keys title, url, source, snippet, published.',
      }),
      runTinyFishAutomation({
        url: `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(symbol)}`,
        goal:
          'Find the latest visible SEC filing titles and dates for this company. Return JSON array with keys title, date, url, formType. If nothing useful is visible, return an empty array.',
      }),
    ]);

    const quote = normalizeQuote(quoteData);
    const news = normalizeNews(newsData).slice(0, 5);
    const filings = normalizeFilings(secData).slice(0, 3);
    const aiSummary = await buildBeginnerSummary({
      query: rawQuery,
      symbol,
      companyName: quote.companyName || companyName,
      quote,
      news,
      filings,
    });

    res.json({
      ok: true,
      mode: 'live',
      query: rawQuery,
      symbol,
      companyName: quote.companyName || companyName,
      sector: quote.sector || 'Unknown',
      industry: quote.industry || 'Unknown',
      description: quote.summary || '',
      website: quote.website || '',
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      volume: quote.volume,
      marketCap: quote.marketCap,
      peRatio: quote.peRatio,
      range52Week: quote.range52Week,
      aiSummary,
      news,
      filings,
      links: buildLinks(rawQuery, symbol, quote.website),
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

app.get('/api/event-impact', async (req, res) => {
  const rawTopic = typeof req.query.topic === 'string' ? req.query.topic.trim() : '';
  const rawMarket = typeof req.query.market === 'string' ? req.query.market.trim() : '';
  const marketFocus = rawMarket || 'S&P 500';

  if (!rawTopic) {
    return res.status(400).json({
      ok: false,
      message: 'Please provide an event, outbreak, or shock to research.',
    });
  }

  if (!TINYFISH_API_KEY || !OPENAI_API_KEY) {
    return res.json({
      ok: false,
      mode: 'config_required',
      topic: rawTopic,
      message:
        'Add TINYFISH_API_KEY and OPENAI_API_KEY to your .env file to enable event history research.',
      missingKeys: {
        tinyFish: !TINYFISH_API_KEY,
        openAI: !OPENAI_API_KEY,
      },
      links: buildEventLinks(rawTopic, marketFocus),
    });
  }

  try {
    let headlines = [];

    try {
      const historyNewsData = await runTinyFishAutomation({
        url: `https://news.google.com/search?q=${encodeURIComponent(`${rawTopic} ${marketFocus} stock market impact market reaction`)}`,
        goal:
          'Extract up to 8 relevant articles about how this event affects or affected the stock market. Recent articles are allowed. Historical articles are allowed. Prioritize market impact, sector impact, stock reaction, or investor reaction. Return JSON array with keys title, url, source, snippet, published.',
      });

      headlines = normalizeNews(historyNewsData).slice(0, 8);
    } catch (error) {
      if (!isTinyFishTimeout(error)) {
        throw error;
      }
    }

    if (!headlines.length) {
      headlines = buildFallbackArticles(rawTopic, marketFocus);
    }

    const insights = await buildEventImpactSummary({
      topic: rawTopic,
      marketFocus,
      headlines,
    });

    res.json({
      ok: true,
      mode: 'live',
      topic: rawTopic,
      marketFocus,
      aiSummary: insights.summary,
      lessons: insights.lessons,
      signalsToWatch: insights.signalsToWatch,
      headlines,
      links: buildEventLinks(rawTopic, marketFocus),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    res.status(500).json({
      ok: false,
      mode: 'error',
      topic: rawTopic,
      message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Stock API listening on http://localhost:${PORT}`);
});

async function resolveTicker(query) {
  if (!openai) {
    return {
      symbol: query.trim().toUpperCase(),
      companyName: query.trim(),
    };
  }

  const prompt = [
    `Stock query: ${query}`,
    'Return only JSON with keys symbol and companyName.',
    'If the user already typed a ticker, keep it.',
    'If the query is a company name, infer the most likely ticker.',
    'Do not add markdown or explanation.',
  ].join('\n');

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    reasoning: {
      effort: OPENAI_REASONING_EFFORT,
    },
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You identify public stock tickers from user queries and return strict JSON only.',
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
  });

  const parsed = safeParseJson(response.output_text);
  return {
    symbol: normalizeSymbol(parsed?.symbol || query),
    companyName: typeof parsed?.companyName === 'string' ? parsed.companyName.trim() : query.trim(),
  };
}

async function runTinyFishAutomation({ url, goal }) {
  const response = await fetch('https://agent.tinyfish.ai/v1/automation/run-async', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': TINYFISH_API_KEY || '',
    },
    body: JSON.stringify({
      url,
      goal,
      browser_profile: 'lite',
      api_integration: 'stocks-for-beginners',
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('TinyFish rejected the request. Check that TINYFISH_API_KEY in your .env file is correct and active.');
    }
    throw new Error(`TinyFish request failed with status ${response.status}.`);
  }

  const kickoff = await response.json();
  const runId = kickoff.run_id || kickoff.id;

  if (!runId) {
    return kickoff.resultJson || kickoff.result || kickoff;
  }

  return pollTinyFishRun(runId);
}

async function pollTinyFishRun(runId) {
  let lastStatus = 'UNKNOWN';

  for (let attempt = 0; attempt < TINYFISH_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(`https://agent.tinyfish.ai/v1/runs/${encodeURIComponent(runId)}`, {
      headers: {
        'X-API-Key': TINYFISH_API_KEY || '',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('TinyFish rejected the polling request. Check that TINYFISH_API_KEY in your .env file is correct and active.');
      }
      throw new Error(`TinyFish polling failed with status ${response.status}.`);
    }

    const data = await response.json();
    const status = String(data.status || '').toUpperCase();
    lastStatus = status || 'UNKNOWN';

    if (status === 'COMPLETED' || status === 'SUCCESS') {
      return data.resultJson || data.result || data;
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(data.error?.message || 'TinyFish automation failed.');
    }

    await delay(TINYFISH_POLL_INTERVAL_MS);
  }

  const totalWaitSeconds = Math.round((TINYFISH_POLL_ATTEMPTS * TINYFISH_POLL_INTERVAL_MS) / 1000);
  throw new Error(
    `TinyFish automation timed out after about ${totalWaitSeconds} seconds (last status: ${lastStatus}). Try again or narrow the request.`,
  );
}

function normalizeQuote(raw) {
  const source = unwrapData(raw);

  return {
    price: toNumber(source?.price),
    change: toNumber(source?.change),
    changePercent: source?.changePercent || source?.change_percent || null,
    volume: source?.volume ? String(source.volume) : null,
    marketCap: toNumber(source?.marketCap || source?.market_cap),
    peRatio: toNumber(source?.peRatio || source?.pe_ratio),
    range52Week: source?.range52Week || source?.range_52_week || null,
    summary: source?.summary || source?.description || '',
    companyName: source?.companyName || source?.name || '',
    sector: source?.sector || '',
    industry: source?.industry || '',
    website: source?.website || '',
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
      snippet: item.snippet || item.summary || '',
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

async function buildBeginnerSummary({ query, symbol, companyName, quote, news, filings }) {
  if (!openai) {
    return `Beginner summary for ${query} (${symbol})\n\nAdd OPENAI_API_KEY to generate a polished explanation.`;
  }

  const prompt = [
    `Stock query: ${query}`,
    `Ticker: ${symbol}`,
    `Company: ${companyName || 'Unknown'}`,
    `Price: ${formatMaybe(quote.price)}`,
    `Change: ${formatMaybe(quote.change)}`,
    `Change percent: ${quote.changePercent || 'Unknown'}`,
    `Market cap: ${formatMaybe(quote.marketCap)}`,
    `P/E ratio: ${formatMaybe(quote.peRatio)}`,
    `52-week range: ${quote.range52Week || 'Unknown'}`,
    `Sector: ${quote.sector || 'Unknown'}`,
    `Industry: ${quote.industry || 'Unknown'}`,
    `Business summary: ${quote.summary || 'No business summary extracted.'}`,
    '',
    `Recent headlines:\n${news.length ? news.map((item) => `- ${item.title} (${item.source})`).join('\n') : '- None found.'}`,
    '',
    `Recent SEC filings:\n${filings.length ? filings.map((item) => `- ${item.title} (${item.date || 'unknown date'})`).join('\n') : '- None found.'}`,
    '',
    'Write a beginner-friendly summary with these sections:',
    '1. What this company does',
    '2. What the stock is doing right now',
    '3. Why it may be moving',
    '4. One beginner risk to watch',
    'Keep it simple, calm, and non-promotional. Do not give direct investment advice.',
  ].join('\n');

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    reasoning: {
      effort: OPENAI_REASONING_EFFORT,
    },
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You explain stocks to beginners in clear, practical language.',
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
  });

  return response.output_text?.trim() || 'No summary was returned.';
}

async function buildEventImpactSummary({ topic, marketFocus, headlines }) {
  if (!openai) {
    return {
      summary: `Historical market-impact summary for ${topic} (${marketFocus}). Add OPENAI_API_KEY to generate a polished explanation.`,
      lessons: ['Add OPENAI_API_KEY to generate lessons.'],
      signalsToWatch: ['Add OPENAI_API_KEY to generate signals to watch.'],
    };
  }

  const prompt = [
    `Event or outbreak: ${topic}`,
    `Market focus: ${marketFocus}`,
    '',
    `Collected headlines:\n${headlines.length ? headlines.map((item) => `- ${item.title} (${item.source}${item.published ? `, ${item.published}` : ''})`).join('\n') : '- None found.'}`,
    '',
    'Return strict JSON with keys:',
    'summary: string',
    'lessons: string[]',
    'signalsToWatch: string[]',
    '',
    'Requirements:',
    'Explain why this event mattered to the market in beginner-friendly language.',
    'Focus on economic transmission channels such as demand shock, supply shock, fear, rates, regulation, transport disruption, or earnings risk.',
    'Keep it calm and practical.',
    'Do not give direct investment advice.',
    'Provide 3 lessons and 3 signals to watch.',
  ].join('\n');

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    reasoning: {
      effort: OPENAI_REASONING_EFFORT,
    },
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You explain historical market reactions to beginners and return strict JSON only.',
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
  });

  const parsed = safeParseJson(response.output_text);
  return {
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : 'No summary was returned.',
    lessons: normalizeStringList(parsed?.lessons, [
      'Focus on the business reason prices moved, not only the headline.',
      'Check which sectors were directly exposed before assuming the whole market reacted the same way.',
      'Watch how long the disruption lasted, because markets often price duration more than fear alone.',
    ]),
    signalsToWatch: normalizeStringList(parsed?.signalsToWatch, [
      'Company guidance changes',
      'Supply-chain disruption updates',
      'Policy, rate, or public-health announcements',
    ]),
  };
}

function buildLinks(query, symbol, website = '') {
  const encodedQuery = encodeURIComponent(query);
  const encodedSymbol = encodeURIComponent(symbol);
  const links = [
    {
      label: 'Yahoo Finance',
      href: `https://finance.yahoo.com/quote/${encodedSymbol}`,
    },
    {
      label: 'SEC EDGAR search',
      href: `https://www.sec.gov/edgar/search/#/q=${encodedQuery}`,
    },
    {
      label: 'Google News search',
      href: `https://news.google.com/search?q=${encodedSymbol}%20stock`,
    },
    {
      label: 'X search',
      href: `https://x.com/search?q=${encodedSymbol}%20stock&src=typed_query`,
    },
  ];

  if (website) {
    links.unshift({
      label: 'Company website',
      href: website,
    });
  }

  return links;
}

function buildEventLinks(topic, marketFocus) {
  const encodedTopic = encodeURIComponent(topic);
  const encodedMarket = encodeURIComponent(marketFocus);

  return [
    {
      label: 'Google News event search',
      href: `https://news.google.com/search?q=${encodedTopic}%20${encodedMarket}%20stock%20market`,
    },
    {
      label: 'Yahoo Finance market news',
      href: 'https://finance.yahoo.com/news/',
    },
    {
      label: 'WHO news',
      href: 'https://www.who.int/news',
    },
  ];
}

function normalizeSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, '');
}

function safeParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function unwrapData(raw) {
  if (!raw) return raw;
  return raw.resultJson || raw.result || raw.data || raw;
}

function formatMaybe(value) {
  if (value == null || value === '') return 'Unknown';
  return String(value);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStringList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  return items.length ? items.slice(0, 3) : fallback;
}

function buildFallbackArticles(topic, marketFocus) {
  return [
    {
      title: `${topic}: market impact coverage`,
      url: `https://news.google.com/search?q=${encodeURIComponent(`${topic} ${marketFocus} stock market impact`)}`,
      source: 'Google News',
      published: '',
      snippet: `Recent and past market-impact articles about ${topic} and ${marketFocus}.`,
    },
    {
      title: `${topic}: sector reaction coverage`,
      url: `https://news.google.com/search?q=${encodeURIComponent(`${topic} ${marketFocus} sector reaction`)}`,
      source: 'Google News',
      published: '',
      snippet: `Coverage of sector winners, losers, and investor reaction linked to ${topic}.`,
    },
    {
      title: `${marketFocus}: Yahoo Finance news`,
      url: 'https://finance.yahoo.com/news/',
      source: 'Yahoo Finance',
      published: '',
      snippet: `Broader market and sector news related to ${marketFocus}.`,
    },
  ];
}

function isTinyFishTimeout(error) {
  return error instanceof Error && error.message.toLowerCase().includes('timed out');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
