export function Masthead() {
  return (
    <header className="masthead" data-masthead>
      <div className="in">
        <a className="wordmark" href="#top">
          Ash <em>&</em> Ember
        </a>
        <div className="mast-mid">A Society Journal of Smoke &amp; Patience · Vol. I</div>
        <nav className="mast-actions" aria-label="Account">
          <a className="mast-signin" href="/login">
            Sign In
          </a>
          <a className="mast-cta" href="/signup">
            Join the Society
          </a>
        </nav>
      </div>
    </header>
  );
}
