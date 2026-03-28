import { FormEvent, useEffect, useState } from 'react';

const commonStocks = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'TSLA', 'SPY', 'QQQ'];
const historyExamples = ['COVID outbreak', 'bird flu outbreak', 'oil shock', 'banking crisis', 'Taiwan earthquake'];

const summaryPreview = [
  {
    title: 'Try a ticker',
    text: 'AAPL, MSFT, NVDA, SPY, and QQQ are good starter searches.',
  },
  {
    title: 'What you get',
    text: 'Price, movement, a plain-English explanation, plus risks and reasons.',
  },
  {
    title: 'How to read it',
    text: 'Use it as a quick overview before you dig deeper elsewhere.',
  },
];

type MarketTheme = {
  label: string;
  score: number;
  note: string;
};

type MarketHeadline = {
  title: string;
  url: string;
  source: string;
  published: string;
  snippet?: string;
};

type MarketSnapshot =
  | {
      ok: true;
      tone: string;
      toneScore: number;
      summary: string;
      beginnerTakeaway: string;
      themes: MarketTheme[];
      headlines: MarketHeadline[];
      watchList: string[];
      updatedAt: string;
    }
  | {
      ok: false;
      mode: 'config_required' | 'error';
      message: string;
    };

type PortfolioMarketStats = {
  tone: string;
  toneScore: number;
  leadingTheme: string;
  leadingThemeScore: number;
  headlineCount: number;
};

type StockSuccessResult = {
  ok: true;
  mode: 'live';
  query: string;
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  description: string;
  price: number | null;
  change: number | null;
  changePercent: string | null;
  marketCap: number | null;
  peRatio: number | null;
  range52Week: string | null;
  beginnerSummary: string;
  whyPeopleLikeIt: string[];
  risks: string[];
  fetchedAt: string;
};

type EventImpactSuccessResult = {
  ok: true;
  mode: 'live';
  topic: string;
  marketFocus: string;
  aiSummary: string;
  lessons: string[];
  signalsToWatch: string[];
  headlines: MarketHeadline[];
  links: Array<{ label: string; href: string }>;
  fetchedAt: string;
};

type ApiErrorResult = {
  ok: false;
  mode: 'config_required' | 'error';
  query?: string;
  topic?: string;
  message: string;
  missingKeys?: {
    tinyFish?: boolean;
    openAI?: boolean;
  };
  links?: Array<{ label: string; href: string }>;
};

type ApiResult = StockSuccessResult | ApiErrorResult;
type EventImpactResult = EventImpactSuccessResult | ApiErrorResult;
type PageView = 'stocks' | 'history';

export default function App() {
  const [view, setView] = useState<PageView>(getInitialView());

  useEffect(() => {
    function syncViewFromHash() {
      setView(getInitialView());
    }

    window.addEventListener('hashchange', syncViewFromHash);
    return () => window.removeEventListener('hashchange', syncViewFromHash);
  }, []);

  return (
    <main className="page-shell">
      <header className="top-nav">
        <a className="brand-mark" href="#stocks">
          FishStocks
        </a>

        <nav className="nav-links" aria-label="Primary">
          <a
            className={view === 'stocks' ? 'nav-link nav-link-active' : 'nav-link'}
            href="#stocks"
            onClick={() => setView('stocks')}
          >
            Stock Summary
          </a>
          <a
            className={view === 'history' ? 'nav-link nav-link-active' : 'nav-link'}
            href="#history"
            onClick={() => setView('history')}
          >
            Event History
          </a>
        </nav>
      </header>

      {view === 'stocks' ? <StockSummaryPage /> : <EventHistoryPage />}
    </main>
  );
}

function StockSummaryPage() {
  const [query, setQuery] = useState('AAPL');
  const [submittedQuery, setSubmittedQuery] = useState('AAPL');
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshot | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState('');
  const [riskTolerance, setRiskTolerance] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [budget, setBudget] = useState('500');

  useEffect(() => {
    let active = true;

    async function loadMarketSnapshot() {
      setMarketLoading(true);
      setMarketError('');

      try {
        const response = await fetch('/api/market-snapshot', { cache: 'no-store' });
        const data = (await response.json()) as MarketSnapshot;

        if (!active) return;

        setMarketSnapshot(data);

        if (!response.ok || !data.ok) {
          setMarketError('message' in data ? data.message : 'Unable to load market snapshot.');
        }
      } catch {
        if (!active) return;

        setMarketError('Could not load the market snapshot.');
        setMarketSnapshot({
          ok: false,
          mode: 'error',
          message: 'Could not load the market snapshot.',
        });
      } finally {
        if (active) setMarketLoading(false);
      }
    }

    loadMarketSnapshot();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleaned = query.trim();
    if (!cleaned) return;

    const normalized = cleaned.toUpperCase();
    setSubmittedQuery(normalized);
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch(`/api/analyze?query=${encodeURIComponent(cleaned)}`);
      const data = (await response.json()) as ApiResult;
      setResult(data);

      if (!response.ok || !data.ok) {
        setErrorMessage('message' in data ? data.message : 'Unable to load stock data.');
      }
    } catch {
      setErrorMessage('Could not reach the local API server.');
      setResult({
        ok: false,
        mode: 'error',
        query: normalized,
        message: 'Could not reach the local API server.',
      });
    } finally {
      setLoading(false);
    }
  }

  const liveResult = result && result.ok ? result : null;
  const investmentSimulator = liveResult
    ? buildInvestmentSimulator(liveResult.price, liveResult.range52Week)
    : null;
  const budgetValue = Number(budget);
  const portfolioMarketStats = buildPortfolioMarketStats(marketSnapshot);
  const portfolioPlan = buildPortfolioPlan(riskTolerance, budgetValue, portfolioMarketStats);

  const statusCopy = loading
    ? 'Getting the stock basics...'
    : liveResult
      ? `Live summary for ${liveResult.companyName}`
      : result && !result.ok && result.mode === 'config_required'
        ? 'Add your TinyFish key to enable live results.'
        : 'Search a stock to get a simple beginner summary.';

  return (
    <>
      <section className="hero hero-single">
        <div className="hero-copy">
          <p className="eyebrow">Stock Search</p>
          <h1>Search a stock and get the basics fast.</h1>
          <p className="hero-text">
            Quick, clear answers: what it is, what moved it, and what to keep an eye on.
          </p>

          <form className="query-form" onSubmit={handleSubmit}>
            <label className="query-label" htmlFor="stock-query">
              Stock name or ticker
            </label>

            <div className="query-row">
              <input
                id="stock-query"
                className="query-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try Apple, AAPL, Microsoft..."
                autoComplete="off"
              />
              <button className="primary-btn" type="submit">
                Analyze
              </button>
            </div>
          </form>

          <div className="suggestion-row" aria-label="Common stock ideas">
            {commonStocks.map((symbol) => (
              <button
                key={symbol}
                className="suggestion-pill"
                type="button"
                onClick={() => {
                  setQuery(symbol);
                  setSubmittedQuery(symbol);
                }}
              >
                {symbol}
              </button>
            ))}
          </div>

          <div className="stats-row" aria-label="Quick overview">
            <div className="stat-card">
              <span>01</span>
              <p>Fast stock snapshot</p>
            </div>
            <div className="stat-card">
              <span>02</span>
              <p>TinyFish pulls live web data</p>
            </div>
            <div className="stat-card">
              <span>03</span>
              <p>Plain-English takeaways</p>
            </div>
          </div>
        </div>

        <aside className="hero-panel hero-panel-tight" aria-label="Summary panel">
          <div className="panel-top">
            <span className="panel-dot panel-dot-green" />
            <span className="panel-dot panel-dot-amber" />
            <span className="panel-dot panel-dot-blue" />
          </div>

          <div className="panel-content">
            <p className="panel-label">Summary</p>
            <h2>{loading || liveResult ? submittedQuery : 'Ready when you are'}</h2>
            <p>{statusCopy}</p>
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

            <div className="panel-scroll">
              {liveResult ? (
                <div className="result-stack">
                  <div className="metric-grid">
                    <div className="result-metric">
                      <span>Price</span>
                      <strong>{formatCurrency(liveResult.price)}</strong>
                    </div>
                    <div className="result-metric">
                      <span>Change</span>
                      <strong>{formatChange(liveResult.change, liveResult.changePercent)}</strong>
                    </div>
                    <div className="result-metric">
                      <span>Sector</span>
                      <strong>{liveResult.sector}</strong>
                    </div>
                  </div>

                  <div className="summary-box summary-box-fixed">
                    <strong>Summary</strong>
                    <p>{liveResult.beginnerSummary}</p>
                  </div>

                  <div className="summary-box summary-box-fixed">
                    <strong>What stands out</strong>
                    <ul className="mini-list">
                      {liveResult.whyPeopleLikeIt.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="summary-box summary-box-fixed">
                    <strong>Things to watch</strong>
                    <ul className="mini-list">
                      {liveResult.risks.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="summary-box summary-box-fixed simulator-box">
                    <strong>If you put in $100</strong>
                    {investmentSimulator ? (
                      <div className="simulator-grid">
                        <p className="simulator-text">
                          At {formatCurrency(liveResult.price)} per share, you would buy about{' '}
                          <strong>{investmentSimulator.shares.toFixed(2)} shares</strong>
                        </p>

                        <div className="simulator-stats">
                          <div className="simulator-stat">
                            <span>Today</span>
                            <strong>{formatCurrency(investmentSimulator.currentValue)}</strong>
                          </div>
                          <div className="simulator-stat">
                            <span>52-week low</span>
                            <strong>{formatCurrency(investmentSimulator.lowValue)}</strong>
                          </div>
                          <div className="simulator-stat">
                            <span>52-week high</span>
                            <strong>{formatCurrency(investmentSimulator.highValue)}</strong>
                          </div>
                        </div>

                        <p className="simulator-note">
                          This is a quick illustration based on the live quote and 52-week range.
                        </p>
                      </div>
                    ) : (
                      <p className="simulator-note">
                        TinyFish did not return a usable price range for this stock yet.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="preview-grid">
                  {summaryPreview.map((item) => (
                    <article key={item.title} className="preview-card">
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </section>

      <section className="market-overview-card" aria-label="Beginner market overview">
        <div className="market-overview-top">
          <div className="market-overview-copy">
            <p className="eyebrow">Market Snapshot</p>
            <h2>What the market looks like right now.</h2>
            <p className="section-text">
              A live read on the biggest stories moving stocks today.
            </p>
          </div>
        </div>

        <div className="market-point-grid">
          {marketLoading ? (
            <>
              <article className="market-point-card market-skeleton" />
              <article className="market-point-card market-skeleton" />
              <article className="market-point-card market-skeleton" />
            </>
          ) : marketSnapshot && marketSnapshot.ok ? (
            <>
              <article className="market-point-card market-point-card-tone">
                <span>Market tone</span>
                <div className="market-tone-pill">
                  {marketSnapshot.tone} {formatToneScore(marketSnapshot.toneScore)}
                </div>
                <p className="market-tone-note">{marketSnapshot.summary}</p>
              </article>
              <article className="market-point-card">
                <span>Beginner takeaway</span>
                <p>{marketSnapshot.beginnerTakeaway}</p>
              </article>
              <article className="market-point-card">
                <span>Watch list</span>
                <p>{marketSnapshot.watchList.join(', ')}</p>
              </article>
            </>
          ) : (
            <>
              <article className="market-point-card market-point-card-tone">
                <span>Market tone</span>
                <div className="market-tone-pill">Waiting on data</div>
                <p className="market-tone-note">{marketError || 'No snapshot available right now.'}</p>
              </article>
              <article className="market-point-card">
                <span>Beginner takeaway</span>
                <p>Try again after the TinyFish key is set or the page refreshes.</p>
              </article>
              <article className="market-point-card">
                <span>Watch list</span>
                <p>SPY, QQQ, mega-cap tech, interest rates</p>
              </article>
            </>
          )}
        </div>

        <div className="market-overview-chart">
          <div className="market-chart-header">
            <strong>What’s driving things</strong>
            <span>
              {marketSnapshot && marketSnapshot.ok
                ? `Updated ${formatTime(marketSnapshot.updatedAt)}`
                : 'Live headlines from TinyFish'}
            </span>
          </div>

          {marketLoading ? (
            <div className="bar-chart">
              <div className="bar-row market-skeleton" />
              <div className="bar-row market-skeleton" />
              <div className="bar-row market-skeleton" />
            </div>
          ) : marketSnapshot && marketSnapshot.ok ? (
            <div className="bar-chart">
              {marketSnapshot.themes.map((bar) => (
                <div key={bar.label} className="bar-row">
                  <div className="bar-labels">
                    <span>{bar.label}</span>
                    <small>{bar.score}%</small>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${bar.score}%` }} />
                  </div>
                  <p className="theme-note">{bar.note}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bar-chart">
              <div className="bar-row">
                <div className="bar-labels">
                  <span>Market headlines</span>
                  <small>offline</small>
                </div>
                <p className="theme-note">{marketError || 'No current headlines available.'}</p>
              </div>
            </div>
          )}

          <div className="headline-list">
            <strong>Current headlines</strong>
            {marketLoading ? (
              <div className="headline-skeleton" />
            ) : marketSnapshot && marketSnapshot.ok ? (
              marketSnapshot.headlines.slice(0, 4).map((headline) => (
                <a
                  key={headline.title}
                  className="headline-item"
                  href={headline.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{headline.title}</span>
                  <small>
                    {headline.source}
                    {headline.published ? ` · ${headline.published}` : ''}
                  </small>
                </a>
              ))
            ) : (
              <p className="chart-note">{marketError || 'No headlines available right now.'}</p>
            )}
          </div>
        </div>
      </section>

      <section className="starter-builder-card" aria-label="Portfolio starter builder">
        <div className="starter-builder-header">
          <div>
            <p className="eyebrow">Portfolio Starter</p>
            <h2>Build a simple starter plan.</h2>
            <p className="section-text">
              Pick your risk level and budget, and get a starter split shaped by live market stats.
            </p>
          </div>
        </div>

        <div className="portfolio-live-stats">
          <article className="portfolio-mini-stat">
            <span>Market tone</span>
            <strong>
              {portfolioMarketStats
                ? `${portfolioMarketStats.tone} (${formatToneScore(portfolioMarketStats.toneScore)})`
                : 'Waiting on TinyFish'}
            </strong>
          </article>
          <article className="portfolio-mini-stat">
            <span>Top theme</span>
            <strong>
              {portfolioMarketStats
                ? `${portfolioMarketStats.leadingTheme} (${portfolioMarketStats.leadingThemeScore}%)`
                : 'Loading...'}
            </strong>
          </article>
          <article className="portfolio-mini-stat">
            <span>Headlines</span>
            <strong>
              {portfolioMarketStats
                ? `${portfolioMarketStats.headlineCount} seen today`
                : 'Loading...'}
            </strong>
          </article>
        </div>

        <form className="starter-builder-form">
          <label className="builder-field">
            <span>Risk tolerance</span>
            <select
              value={riskTolerance}
              onChange={(event) =>
                setRiskTolerance(event.target.value as 'Low' | 'Medium' | 'High')
              }
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </label>

          <label className="builder-field">
            <span>Budget</span>
            <div className="budget-input-wrap">
              <span>$</span>
              <input
                type="number"
                min="1"
                step="1"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                placeholder="500"
              />
            </div>
          </label>
        </form>

        <div className="portfolio-plan-card">
          <div className="portfolio-plan-top">
            <strong>Suggested allocation</strong>
            <span>{Number.isFinite(budgetValue) ? formatCurrency(budgetValue) : '$0'}</span>
          </div>

          <div className="portfolio-allocation-grid">
            {portfolioPlan.map((item) => (
              <article key={item.label} className="portfolio-allocation-card">
                <div className="portfolio-allocation-row">
                  <span>{item.label}</span>
                  <strong>{item.percent}%</strong>
                </div>
                <p>{formatCurrency(item.amount)}</p>
              </article>
            ))}
          </div>

          <p className="portfolio-note">
            This is a simple starter split, not personal financial advice.
          </p>
        </div>
      </section>
    </>
  );
}

function EventHistoryPage() {
  const [topic, setTopic] = useState('COVID outbreak');
  const [marketFocus, setMarketFocus] = useState('S&P 500');
  const [submittedTopic, setSubmittedTopic] = useState('COVID outbreak');
  const [result, setResult] = useState<EventImpactResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanedTopic = topic.trim();
    const cleanedMarket = marketFocus.trim();
    if (!cleanedTopic) return;

    setSubmittedTopic(cleanedTopic);
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch(
        `/api/event-impact?topic=${encodeURIComponent(cleanedTopic)}&market=${encodeURIComponent(cleanedMarket || 'S&P 500')}`,
      );
      const data = (await response.json()) as EventImpactResult;
      setResult(data);

      if (!response.ok || !data.ok) {
        setErrorMessage('message' in data ? data.message : 'Unable to load event history.');
      }
    } catch {
      setErrorMessage('Could not reach the local API server.');
      setResult({
        ok: false,
        mode: 'error',
        topic: cleanedTopic,
        message: 'Could not reach the local API server.',
      });
    } finally {
      setLoading(false);
    }
  }

  const liveResult = result && result.ok ? result : null;

  const statusCopy = loading
    ? 'Collecting past headlines and market context...'
    : liveResult
      ? `Historical context for ${submittedTopic}`
      : result && !result.ok && result.mode === 'config_required'
        ? 'Add API keys to enable live event history.'
        : 'Search an event to see how markets reacted and what beginners should learn.';

  return (
    <>
      <section className="history-hero">
        <div className="history-shell">
          <p className="eyebrow">Event History Lab</p>
          <h1>Study past shocks before the next one hits.</h1>
          <p className="history-intro">
            Search an event and market focus to get a simple explanation, key takeaways,
            and related reading.
          </p>

          <form className="history-form" onSubmit={handleSubmit}>
            <div className="history-form-row">
              <label className="history-field" htmlFor="history-topic">
                <span className="query-label">Event</span>
                <input
                  id="history-topic"
                  className="query-input"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="COVID outbreak, banking crisis, oil shock..."
                  autoComplete="off"
                />
              </label>

              <label className="history-field" htmlFor="history-market">
                <span className="query-label">Market Focus</span>
                <input
                  id="history-market"
                  className="query-input"
                  value={marketFocus}
                  onChange={(event) => setMarketFocus(event.target.value)}
                  placeholder="S&P 500, airlines, oil stocks..."
                  autoComplete="off"
                />
              </label>

              <button className="primary-btn history-submit" type="submit">
                Research Event
              </button>
            </div>
          </form>

          <div className="history-toolbar">
            <div className="chip-row" aria-label="Example events">
              {historyExamples.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="example-chip"
                  onClick={() => setTopic(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="history-status-card">
              <strong>{loading ? 'Loading' : 'Status'}</strong>
              <span>{statusCopy}</span>
            </div>
          </div>

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        </div>
      </section>

      {liveResult ? (
        <section className="section report-section">
          <div className="result-stack">
            <div className="metric-grid">
              <div className="result-metric">
                <span>Topic</span>
                <strong>{liveResult.topic}</strong>
              </div>
              <div className="result-metric">
                <span>Focus</span>
                <strong>{liveResult.marketFocus}</strong>
              </div>
              <div className="result-metric">
                <span>Articles</span>
                <strong>{String(liveResult.headlines.length)}</strong>
              </div>
            </div>

            <div className="report-layout">
              <div className="summary-box">
                <strong>Simple Explanation</strong>
                <p>{liveResult.aiSummary}</p>
              </div>

              <div className="insight-grid">
                <article className="insight-card">
                  <p className="insight-label">Main Lessons</p>
                  <div className="insight-stack">
                    {liveResult.lessons.map((lesson, index) => (
                      <div key={lesson} className="insight-row">
                        <span className="insight-number">0{index + 1}</span>
                        <p>{lesson}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="insight-card insight-card-blue">
                  <p className="insight-label">Watch Next Time</p>
                  <div className="signal-grid">
                    {liveResult.signalsToWatch.map((signal) => (
                      <div key={signal} className="signal-card">
                        {signal}
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <div className="reading-card">
                <div className="reading-card-header">
                  <strong>Related Articles</strong>
                  <span>Open a source to read more</span>
                </div>

                {liveResult.headlines.length ? (
                  <div className="headline-grid">
                    {liveResult.headlines.map((item) => (
                      <a
                        key={`${item.title}-${item.url}`}
                        className="headline-card"
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div className="headline-title-block">
                          <span>{item.title}</span>
                        </div>
                        <small className="headline-meta">
                          {formatSourceLine(item.source, item.published)}
                        </small>
                        <div className="headline-snippet">
                          <p>{item.snippet || 'Open the article to read the full explanation.'}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p>No relevant articles came back for that event.</p>
                )}

                <div className="source-card-row">
                  {liveResult.links.map((link) => (
                    <a
                      key={link.label}
                      className="source-card"
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <strong>{link.label}</strong>
                      <span>Open source</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function getInitialView(): PageView {
  return window.location.hash === '#history' ? 'history' : 'stocks';
}

function formatCurrency(value: number | null) {
  if (value == null) return 'N/A';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatChange(change: number | null, percent: string | null) {
  if (change == null && !percent) return 'N/A';

  const signedChange = change == null ? 'N/A' : `${change > 0 ? '+' : ''}${change.toFixed(2)}`;
  return percent ? `${signedChange} (${percent})` : signedChange;
}

function formatSourceLine(source: string, published: string) {
  return published ? `${source} | ${published}` : source;
}

function formatToneScore(score: number) {
  if (score >= 70) return ' - strong';
  if (score >= 50) return ' - mixed';
  return ' - cautious';
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'just now';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function buildInvestmentSimulator(price: number | null, range52Week: string | null) {
  if (price == null || price <= 0) return null;

  const range = parse52WeekRange(range52Week);
  const shares = 100 / price;

  return {
    shares,
    currentValue: 100,
    lowValue: range ? shares * range.low : null,
    highValue: range ? shares * range.high : null,
  };
}

function parse52WeekRange(range52Week: string | null) {
  if (!range52Week) return null;

  const parts = range52Week
    .split('-')
    .map((part) => parsePriceLikeNumber(part))
    .filter((value): value is number => Number.isFinite(value));

  if (parts.length < 2) return null;

  const [low, high] = parts[0] <= parts[1] ? parts : [parts[1], parts[0]];
  return { low, high };
}

function parsePriceLikeNumber(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function buildPortfolioPlan(
  riskTolerance: 'Low' | 'Medium' | 'High',
  budget: number,
  marketStats: PortfolioMarketStats | null,
) {
  const safeBudget = Number.isFinite(budget) && budget > 0 ? budget : 0;

  const basePlans = {
    Low: { ETFs: 55, 'Safe stocks': 30, Tech: 15 },
    Medium: { ETFs: 40, 'Safe stocks': 30, Tech: 30 },
    High: { ETFs: 25, 'Safe stocks': 25, Tech: 50 },
  } as const;

  const weights = { ...basePlans[riskTolerance] };
  const toneScore = marketStats?.toneScore ?? 55;
  const leadingTheme = marketStats?.leadingTheme.toLowerCase() ?? '';

  if (toneScore >= 70) {
    weights.Tech += 6;
    weights.ETFs -= 3;
    weights['Safe stocks'] -= 3;
  } else if (toneScore <= 45) {
    weights.ETFs += 8;
    weights['Safe stocks'] += 5;
    weights.Tech -= 13;
  } else {
    weights.ETFs += 2;
    weights['Safe stocks'] += 2;
    weights.Tech -= 4;
  }

  if (leadingTheme.includes('tech') || leadingTheme.includes('ai') || leadingTheme.includes('chip')) {
    weights.Tech += 5;
    weights.ETFs -= 2;
    weights['Safe stocks'] -= 3;
  }

  if (
    leadingTheme.includes('rate') ||
    leadingTheme.includes('bond') ||
    leadingTheme.includes('inflation')
  ) {
    weights.ETFs += 5;
    weights['Safe stocks'] += 4;
    weights.Tech -= 9;
  }

  const normalized = normalizePortfolioWeights(weights);

  return [
    { label: 'ETFs', percent: normalized.ETFs },
    { label: 'Tech', percent: normalized.Tech },
    { label: 'Safe stocks', percent: normalized['Safe stocks'] },
  ].map((item) => ({
    ...item,
    amount: (safeBudget * item.percent) / 100,
  }));
}

function buildPortfolioMarketStats(snapshot: MarketSnapshot | null): PortfolioMarketStats | null {
  if (!snapshot || !snapshot.ok) return null;

  const leadingTheme = snapshot.themes.reduce(
    (best, theme) => (theme.score > best.score ? theme : best),
    snapshot.themes[0] || { label: snapshot.tone, score: snapshot.toneScore, note: '' },
  );

  return {
    tone: snapshot.tone,
    toneScore: snapshot.toneScore,
    leadingTheme: leadingTheme.label,
    leadingThemeScore: leadingTheme.score,
    headlineCount: snapshot.headlines.length,
  };
}

function normalizePortfolioWeights(weights: Record<string, number>) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (total <= 0) {
    return { ETFs: 0, Tech: 0, 'Safe stocks': 0 };
  }

  const normalized = Object.fromEntries(
    entries.map(([key, value]) => [key, Math.round((value / total) * 100)]),
  ) as Record<string, number>;

  const currentTotal = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  const delta = 100 - currentTotal;

  normalized.ETFs = (normalized.ETFs || 0) + delta;

  return {
    ETFs: normalized.ETFs || 0,
    Tech: normalized.Tech || 0,
    'Safe stocks': normalized['Safe stocks'] || 0,
  };
}
