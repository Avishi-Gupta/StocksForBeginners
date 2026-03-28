const quickStats = [
  { label: 'Learn the basics', value: '01' },
  { label: 'Track simple ideas', value: '02' },
  { label: 'Ask AI later', value: '03' },
];

const starterCards = [
  {
    title: 'Market 101',
    body: 'Plain-English explanations of stocks, ETFs, risk, and how the market moves.',
  },
  {
    title: 'Watchlist',
    body: 'A simple place to save companies or funds you want to understand better.',
  },
  {
    title: 'AI Coach',
    body: 'Future chat assistant that answers questions like a patient tutor, not a trader.',
  },
];

const learningSteps = [
  'Start with terms like share, dividend, index fund, and portfolio.',
  'See how price, earnings, and news can affect a company.',
  'Use the AI agent to explain why a stock moved in simple language.',
];

function App() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">StocksFor Beginners</p>
          <h1>Stocks for beginners, with room for an AI coach later.</h1>
          <p className="hero-text">
            This is a clean React starter for a beginner-friendly investing app.
            It focuses on learning, tracking, and clarity first.
          </p>

          <div className="hero-actions">
            <a className="primary-btn" href="#features">
              Explore the structure
            </a>
            <a className="secondary-btn" href="#learn">
              See the learning flow
            </a>
          </div>

          <div className="stats-row" aria-label="Quick structure overview">
            {quickStats.map((item) => (
              <div key={item.label} className="stat-card">
                <span>{item.value}</span>
                <p>{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="hero-panel" aria-label="Preview panel">
          <div className="panel-top">
            <span className="panel-dot panel-dot-green" />
            <span className="panel-dot panel-dot-amber" />
            <span className="panel-dot panel-dot-blue" />
          </div>
          <div className="panel-content">
            <p className="panel-label">Today&apos;s focus</p>
            <h2>Learn before you invest.</h2>
            <p>
              A calm layout that can later hold stock search, AI explanations, and
              beginner-safe insights.
            </p>
            <div className="mini-metric">
              <strong>Beginner-first</strong>
              <span>simple language, clear sections, no clutter</span>
            </div>
          </div>
        </aside>
      </section>

      <section id="features" className="section">
        <div className="section-heading">
          <p className="eyebrow">Structure</p>
          <h2>Core sections to build on.</h2>
        </div>

        <div className="card-grid">
          {starterCards.map((card) => (
            <article key={card.title} className="info-card">
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="learn" className="section split-section">
        <div className="section-heading">
          <p className="eyebrow">Learning flow</p>
          <h2>Keep the first version simple.</h2>
          <p className="section-text">
            The best first release is usually a landing page, a few educational
            sections, and placeholders for future AI features.
          </p>
        </div>

        <ol className="steps-list">
          {learningSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="cta-banner">
        <div>
          <p className="eyebrow">Next step</p>
          <h2>We can turn this into a real app structure next.</h2>
        </div>
        <p>
          Add routing, stock search, watchlists, and an AI assistant once you are
          ready.
        </p>
      </section>
    </main>
  );
}

export default App;
