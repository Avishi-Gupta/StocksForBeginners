import { FormEvent, useEffect, useState } from 'react';

type ApiNewsItem = {
  title: string;
  url: string;
  source: string;
  published: string;
  snippet: string;
};

type ApiResult =
  | {
      ok: true;
      mode: 'live';
      query: string;
      symbol: string;
      companyName: string;
      sector: string;
      industry: string;
      description: string;
      website: string;
      price: number | null;
      change: number | null;
      changePercent: string | null;
      volume: string | null;
      marketCap: number | null;
      peRatio: number | null;
      range52Week: string | null;
      aiSummary: string;
      news: ApiNewsItem[];
      filings: Array<{ title: string; date: string; url: string; formType: string }>;
      links: Array<{ label: string; href: string }>;
      fetchedAt: string;
    }
  | ApiErrorResult;

type EventImpactResult =
  | {
      ok: true;
      mode: 'live';
      topic: string;
      marketFocus: string;
      aiSummary: string;
      lessons: string[];
      signalsToWatch: string[];
      headlines: ApiNewsItem[];
      links: Array<{ label: string; href: string }>;
      fetchedAt: string;
    }
  | ApiErrorResult;

type ApiErrorResult = {
  ok: false;
  mode: 'config_required' | 'error';
  query?: string;
  topic?: string;
  message: string;
  missingKeys?: {
    tinyFish: boolean;
    openAI: boolean;
  };
  links?: Array<{ label: string; href: string }>;
};

type PageView = 'stocks' | 'history';

const dataSources = [
  {
    title: 'Yahoo Finance',
    body: 'Use the quote page for price, change, valuation, and company summary.',
    href: 'https://finance.yahoo.com/',
  },
  {
    title: 'Google News',
    body: 'Use recent and historical headlines to explain why markets reacted.',
    href: 'https://news.google.com/',
  },
  {
    title: 'SEC EDGAR',
    body: 'Use filings for official company facts, earnings updates, and risk disclosures.',
    href: 'https://www.sec.gov/edgar/search-and-access',
  },
  {
    title: 'Company IR',
    body: 'Use investor-relations releases for management commentary and official updates.',
    href: 'https://investor.apple.com/investor-relations/default.aspx',
  },
  {
    title: 'Public Health / Policy Sources',
    body: 'For outbreaks or macro shocks, cross-check the original event source before trusting market commentary.',
    href: 'https://www.who.int/',
  },
  {
    title: 'OpenAI',
    body: 'Use the model to turn raw headlines into a calm beginner explanation.',
    href: 'https://platform.openai.com/docs',
  },
];

const workflowSteps = [
  'Accept a stock name or ticker from the user.',
  'Resolve the most likely ticker with OpenAI.',
  'Fetch the quote page, recent news, and SEC filings with TinyFish.',
  'Ask OpenAI to explain the findings in simple language.',
  'Show a beginner summary with risks, context, and next steps.',
];

const historyExamples = ['COVID outbreak', 'bird flu outbreak', 'oil shock', 'banking crisis', 'Taiwan earthquake'];

const exampleOutput = [
  'What the company does in one sentence.',
  'Current price and recent movement.',
  '2 to 3 recent headlines that matter.',
  'One beginner note about risk or volatility.',
];

function App() {
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
          Stocks For Beginners
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

      if (!response.ok) {
        setErrorMessage('message' in data ? data.message : 'Unable to load stock data.');
      } else if (data.ok === false) {
        setErrorMessage(data.message);
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
  const statusCopy =
    loading
      ? 'Analyzing TinyFish data...'
      : liveResult
        ? `Live summary for ${liveResult.companyName}`
        : result && !result.ok && result.mode === 'config_required'
          ? 'Add API keys to enable live results.'
          : 'Run a stock query to see the report here.';

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Stock Agent Starter</p>
          <h1>Ask for a stock, get a beginner-friendly summary.</h1>
          <p className="hero-text">
            This version uses TinyFish for live web extraction and OpenAI to explain the
            result in simple language.
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

          <div className="stats-row" aria-label="Quick overview">
            <div className="stat-card">
              <span>01</span>
              <p>Beginner explanation first</p>
            </div>
            <div className="stat-card">
              <span>02</span>
              <p>TinyFish scrapes public web sources</p>
            </div>
            <div className="stat-card">
              <span>03</span>
              <p>OpenAI turns it into a clean summary</p>
            </div>
          </div>
        </div>

        <aside className="hero-panel" aria-label="Preview panel">
          <div className="panel-top">
            <span className="panel-dot panel-dot-green" />
            <span className="panel-dot panel-dot-amber" />
            <span className="panel-dot panel-dot-blue" />
          </div>
          <div className="panel-content">
            <p className="panel-label">Preview output</p>
            <h2>{loading || liveResult ? submittedQuery : `${submittedQuery} beginner summary`}</h2>
            <p>{statusCopy}</p>
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
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

                <div className="summary-box">
                  <strong>AI summary</strong>
                  <p>{liveResult.aiSummary}</p>
                </div>

                <div className="news-list">
                  <strong>Recent headlines</strong>
                  {liveResult.news.length ? (
                    liveResult.news.slice(0, 3).map((item) => (
                      <a
                        key={item.title}
                        className="news-item"
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>{item.title}</span>
                        <small>{formatSourceLine(item.source, item.published)}</small>
                      </a>
                    ))
                  ) : (
                    <p>No recent headlines came back from the news source.</p>
                  )}
                </div>

                <div className="news-list">
                  <strong>Recent SEC filings</strong>
                  {liveResult.filings.length ? (
                    liveResult.filings.map((item) => (
                      <a
                        key={`${item.title}-${item.date}`}
                        className="news-item"
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>{item.title}</span>
                        <small>{item.date || item.formType || 'SEC filing'}</small>
                      </a>
                    ))
                  ) : (
                    <p>No recent filings came back from SEC EDGAR.</p>
                  )}
                </div>

                <div className="link-row">
                  {liveResult.links.map((link) => (
                    <a key={link.label} className="card-link" href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mini-metric">
                <strong>What the model should return</strong>
                <ul className="mini-list">
                  {exampleOutput.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </section>

      <section id="sources" className="section">
        <div className="section-heading">
          <p className="eyebrow">Data sources</p>
          <h2>Use public web pages before social posts.</h2>
          <p className="section-text">
            These are the websites we should lean on when the stock agent looks up a
            company.
          </p>
        </div>

        <div className="card-grid">
          {dataSources.map((source) => (
            <article key={source.title} className="info-card">
              <h3>{source.title}</h3>
              <p>{source.body}</p>
              <a className="card-link" href={source.href} target="_blank" rel="noreferrer">
                Open source
              </a>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="section split-section">
        <div className="section-heading">
          <p className="eyebrow">Workflow</p>
          <h2>Simple pipeline for the AI agent.</h2>
          <p className="section-text">
            We can wire this up in small steps so the app stays understandable while we
            build.
          </p>
        </div>

        <ol className="steps-list">
          {workflowSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
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

      if (!response.ok) {
        setErrorMessage('message' in data ? data.message : 'Unable to load event history.');
      } else if (data.ok === false) {
        setErrorMessage(data.message);
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
  const statusCopy =
    loading
      ? 'Collecting past headlines and market context...'
      : liveResult
        ? `Historical context for ${liveResult.topic}`
        : result && !result.ok && result.mode === 'config_required'
          ? 'Add API keys to enable live event history.'
          : 'Search an event to see how markets reacted and what beginners should learn.';

  return (
    <>
      <section className="hero hero-history">
        <div className="hero-copy">
          <p className="eyebrow">Event History Lab</p>
          <h1>Study past shocks before the next one hits.</h1>
          <p className="hero-text">
            This page collects past headlines and explains why outbreaks or macro events
            changed the stock market, so a beginner can spot patterns instead of
            panicking.
          </p>

          <form className="query-form" onSubmit={handleSubmit}>
            <label className="query-label" htmlFor="history-topic">
              Event or outbreak
            </label>
            <div className="query-row">
              <input
                id="history-topic"
                className="query-input"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Try COVID outbreak, banking crisis, oil shock..."
                autoComplete="off"
              />
            </div>
            <label className="query-label" htmlFor="history-market">
              Market focus
            </label>
            <div className="query-row">
              <input
                id="history-market"
                className="query-input"
                value={marketFocus}
                onChange={(event) => setMarketFocus(event.target.value)}
                placeholder="S&P 500, airlines, oil stocks, semiconductor stocks..."
                autoComplete="off"
              />
              <button className="primary-btn" type="submit">
                Research Event
              </button>
            </div>
          </form>

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
        </div>

        <aside className="hero-panel" aria-label="Historical analysis panel">
          <div className="panel-top">
            <span className="panel-dot panel-dot-green" />
            <span className="panel-dot panel-dot-amber" />
            <span className="panel-dot panel-dot-blue" />
          </div>
          <div className="panel-content">
            <p className="panel-label">Event impact report</p>
            <h2>{loading || liveResult ? submittedTopic : 'Past market reactions'}</h2>
            <p>{statusCopy}</p>
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
            {liveResult ? (
              <div className="result-stack">
                <div className="summary-box">
                  <strong>What happened and why markets moved</strong>
                  <p>{liveResult.aiSummary}</p>
                </div>

                <div className="split-card-grid">
                  <div className="news-list">
                    <strong>Lessons for beginners</strong>
                    <ul className="mini-list compact-list">
                      {liveResult.lessons.map((lesson) => (
                        <li key={lesson}>{lesson}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="news-list">
                    <strong>Signals to watch next time</strong>
                    <ul className="mini-list compact-list">
                      {liveResult.signalsToWatch.map((signal) => (
                        <li key={signal}>{signal}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="news-list">
                  <strong>Past headlines collected</strong>
                  {liveResult.headlines.length ? (
                    liveResult.headlines.map((item) => (
                      <a
                        key={`${item.title}-${item.url}`}
                        className="news-item"
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>{item.title}</span>
                        <small>{formatSourceLine(item.source, item.published)}</small>
                      </a>
                    ))
                  ) : (
                    <p>No historical headlines came back for that event.</p>
                  )}
                </div>

                <div className="link-row">
                  {liveResult.links.map((link) => (
                    <a key={link.label} className="card-link" href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mini-metric">
                <strong>What this page should teach</strong>
                <ul className="mini-list">
                  <li>What the event was and why investors cared.</li>
                  <li>Which sectors or indexes were hit first.</li>
                  <li>What signals mattered before and after the move.</li>
                  <li>What a beginner can watch during the next shock.</li>
                </ul>
              </div>
            )}
          </div>
        </aside>
      </section>

      <section className="section split-section">
        <div className="section-heading">
          <p className="eyebrow">How to use it</p>
          <h2>Learn from old headlines before new panic starts.</h2>
          <p className="section-text">
            Search outbreaks, policy shocks, supply-chain events, or banking stress and
            compare the market reaction to what happened underneath.
          </p>
        </div>

        <ol className="steps-list">
          <li>Search the event in plain English, not just the ticker.</li>
          <li>Use a market focus like airlines, energy, or S&amp;P 500.</li>
          <li>Read the lessons section before looking at price moves alone.</li>
          <li>Watch for repeated signals that could matter in future outbreaks.</li>
        </ol>
      </section>
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

  const signedChange =
    change == null
      ? 'N/A'
      : `${change > 0 ? '+' : ''}${change.toFixed(2)}`;

  return percent ? `${signedChange} (${percent})` : signedChange;
}

function formatSourceLine(source: string, published: string) {
  return published ? `${source} | ${published}` : source;
}

export default App;
