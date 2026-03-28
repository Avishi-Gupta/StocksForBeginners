import cors from 'cors';
import 'dotenv/config';
import express from 'express';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY?.trim();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
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
    openAIConfigured: Boolean(OPENAI_API_KEY),
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
      mode: 'error',
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

    return res.json({
      ok: true,
      mode: 'live',
      query: rawQuery,
      symbol,
      companyName,
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
    return res.status(500).json({
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

    const articleQuery = buildEventArticleQuery(rawTopic, marketFocus);

    try {
      const historyNewsData = await runTinyFishAutomation({
        url: `https://news.google.com/search?q=${encodeURIComponent(articleQuery)}`,
        goal:
          'Extract up to 8 relevant articles about how this event affects or affected the stock market. Recent articles are allowed. Historical articles are allowed. The article does not need to repeat the exact search words in the headline. Keep an article if the snippet or visible page context shows it is clearly about the same event or its market effects. Relevance can come from related signals like oil prices, supply disruption, sanctions, transport disruption, investor fear, sector pressure, stock reaction, earnings risk, or policy response. Use meaning and context, not exact headline keyword matching. Return JSON array with keys title, url, source, snippet, published.',
      });

      headlines = normalizeNews(historyNewsData).slice(0, 8);
    } catch (error) {
      if (!isTinyFishRecoverable(error)) {
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

    return res.json({
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
    return res.status(500).json({
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

async function runTinyFishAutomation({
  url,
  goal,
}) {
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
    if (response.status === 401) {
      throw new Error(
        'TinyFish rejected the request. Check that TINYFISH_API_KEY in your .env file is correct and active.',
      );
    }

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
        'Extract the current market mood and the latest stock market headlines for the day. Return JSON with keys tone, toneScore, summary, beginnerTakeaway, themes, headlines, and watchList. themes should be an array of objects with keys label, score, note. headlines should be an array of objects with keys title, url, source, published. watchList should be an array of short strings. Keep the tone and summary beginner-friendly and based on the current headlines on the page.',
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
    website: source?.website || '',
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
      snippet: item.snippet || '',
    }))
    .filter((item) => item.title);
}

async function buildEventImpactSummary({
  topic,
  marketFocus,
  headlines,
}) {
  if (!OPENAI_API_KEY) {
    return {
      summary: `Historical market-impact summary for ${topic} (${marketFocus}). Add OPENAI_API_KEY to generate a polished explanation.`,
      lessons: ['Focus on the business reason prices moved, not only the headline.'],
      signalsToWatch: ['Company guidance changes', 'Supply-chain disruption updates', 'Policy announcements'],
    };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-5.2',
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
          content: [
            {
              type: 'input_text',
              text: [
                `Event or outbreak: ${topic}`,
                `Market focus: ${marketFocus}`,
                '',
                `Collected headlines:\n${
                  headlines.length
                    ? headlines
                        .map(
                          (item) =>
                            `- ${item.title} (${item.source}${item.published ? `, ${item.published}` : ''})`,
                        )
                        .join('\n')
                    : '- None found.'
                }`,
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
              ].join('\n'),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}.`);
  }

  const data = await response.json();
  const outputText = extractResponseText(data);
  const parsed = safeParseJson(outputText);

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

function buildEventArticleQuery(topic, marketFocus) {
  const contextTerms = buildEventContextTerms(topic);
  return `${topic} ${marketFocus} stock market impact sector reaction investor response business effects analysis ${contextTerms}`.trim();
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

function buildEventContextTerms(topic) {
  const normalizedTopic = String(topic || '').toLowerCase();

  if (/(war|conflict|attack|missile|iran|israel|ukraine|russia|middle east)/.test(normalizedTopic)) {
    return 'oil prices energy shipping sanctions defense airline risk commodity supply disruption';
  }

  if (/(outbreak|pandemic|covid|virus|health|epidemic)/.test(normalizedTopic)) {
    return 'travel demand lockdown vaccine hospital supply chain remote work consumer slowdown';
  }

  if (/(bank|banking|credit|liquidity|deposit|financial crisis)/.test(normalizedTopic)) {
    return 'interest rates credit stress deposit flight regulation lending recession risk';
  }

  if (/(inflation|rate hike|rates|fed|central bank)/.test(normalizedTopic)) {
    return 'borrowing costs consumer demand valuation bond yields policy tightening';
  }

  if (/(oil|gas|energy|commodity|opec)/.test(normalizedTopic)) {
    return 'commodity prices inflation transport costs refining margins producer profits';
  }

  return 'supply chain consumer demand investor sentiment policy response earnings risk';
}

function normalizeSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, '');
}

function normalizeStringList(value, fallback = []) {
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean);
    return items.length ? items : fallback;
  }

  if (typeof value === 'string') {
    const items = value
      .split('\n')
      .map((item) => item.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);

    return items.length ? items : fallback;
  }

  return fallback;
}

function clampNumber(value, min, max, fallback) {
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, safeValue));
}

function unwrapData(raw) {
  if (!raw) return raw;
  return raw.resultJson || raw.result || raw.data || raw;
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,%\s,]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isTinyFishRecoverable(error) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();

  return (
    message.includes('timed out') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  );
}

function safeParseJson(value) {
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;

  const content = data?.output?.flatMap((item) => item?.content || []) || [];
  const firstText = content.find((item) => typeof item?.text === 'string');
  return firstText?.text || '';
}
