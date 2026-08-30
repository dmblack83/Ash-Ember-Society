export function LandingFooter() {
  return (
    <footer data-footer-parallax>
      <div className="foot-in">
        <a className="wordmark" href="#top">
          Ash <em>&</em> Ember
        </a>
        <nav className="foot-links">
          <a href="#top">The Society</a>
          <a href="/signup">Membership</a>
          <a href="/discover/cigar-news">Journal</a>
          <a href="/login">Sign In</a>
        </nav>
        <div className="foot-note">Smoke slowly. MMXXVI.</div>
      </div>
      <div className="foot-legal">
        <span>© MMXXVI The Ash &amp; Ember Society. All rights reserved.</span>
        <nav>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          {/* TODO(dave): confirm mailto vs. a real contact route before merge */}
          <a href="mailto:dmblack83@gmail.com">Contact</a>
          <a
            href="https://www.instagram.com/ash_and_ember_society"
            target="_blank"
            rel="noopener"
          >
            Instagram
          </a>
        </nav>
      </div>
    </footer>
  );
}
