import { FormEvent, useState } from 'react';

type ApiNewsItem = {
  title: string;
  url: string;
  source: string;
  timePublished: string;
  summary: string;
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
      dividendYield: string | null;
      aiSummary: string;
      news: ApiNewsItem[];
      filings: Array<{ title: string; date: string; url: string; formType: string }>;
      links: Array<{ label: string; href: string }>;
      fetchedAt: string;
    }
  | {
      ok: false;
      mode: 'config_required' | 'error';
      query: string;
      message: string;
      missingKeys?: {
        tinyFish: boolean;
        openAI: boolean;
      };
      links?: Array<{ label: string; href: string }>;
    };

const dataSources = [
  {
    title: 'Yahoo Finance',
    body: 'Use the quote page for price, change, valuation, and company summary.',
    href: 'https://finance.yahoo.com/',
  },
  {
    title: 'Google News',
    body: 'Use recent headlines to explain why the stock may be moving today.',
    href: 'https://news.google.com/',
  },
  {
    title: 'SEC EDGAR',
    body: 'Use filings for official company facts, earnings updates, and risk disclosures.',
    href: 'https://www.sec.gov/edgar/search-and-access',
  },
  {
    title: 'Company IR',
    body: 'Use the company investor relations page for press releases and earnings decks.',
    href: 'https://investor.apple.com/investor-relations/default.aspx',
  },
  {
    title: 'X / Twitter',
    body: 'Use carefully for sentiment and quick reactions, not as a primary source.',
    href: 'https://developer.x.com/en/docs/twitter-api',
  },
  {
    title: 'OpenAI',
    body: 'Use the model to turn raw data into a beginner-friendly summary.',
    href: 'https://platform.openai.com/docs',
  },
];

const workflowSteps = [
  'Accept a stock name or ticker from the user.',
  'Use OpenAI to resolve the most likely ticker.',
  'Fetch the quote page, recent news, and SEC filings with TinyFish.',
  'Ask OpenAI to explain the findings in simple language.',
  'Show a beginner summary with risks, context, and next steps.',
];

const exampleOutput = [
  'What the company does in one sentence.',
  'Current price and recent movement.',
  '2 to 3 recent headlines that matter.',
  'One beginner note about risk or volatility.',
];

function App() {
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
        setErrorMessage(data && 'message' in data ? data.message : 'Unable to load stock data.');
      } else if (data.ok === false) {
        setErrorMessage(data.message);
      }
    } catch (_error) {
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
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Stock Agent Starter</p>
          <h1>Ask for a stock, get a beginner-friendly summary.</h1>
          <p className="hero-text">
            This version uses TinyFish for live web extraction and OpenAI to explain
            the result in simple language.
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
                        <small>{item.source}</small>
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

      <section className="cta-banner">
        <div>
          <p className="eyebrow">Next build step</p>
          <h2>Connect the form to live TinyFish data.</h2>
        </div>
        <p>
          Once you add the TinyFish and OpenAI keys, this page can show a real
          beginner stock report for any ticker.
        </p>
      </section>
    </main>
  );
}

export default App;

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
