export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-kicker" data-hero-kicker>
        Est. MMXXVI · For the Patient
      </div>
      <h1 data-hero-headline>
        <span className="line l1">The slow art</span>
        <span className="line l2">of honoring</span>
        <span className="line l3">the ritual of the leaf.</span>
      </h1>
      <div className="hero-foot">
        <p className="hero-deck" data-hero-deck>
          An exclusive digital sanctuary for the modern aficionado. Track your collection, refine
          your palate, and connect with a society of discerning enthusiasts.
        </p>
        <div className="hero-ctas" data-hero-ctas>
          <a className="btn-primary" href="/signup">
            Join the Society
          </a>
          <span className="cta-note">Free to join</span>
        </div>
      </div>
      <div className="scroll-cue" data-hero-cue>
        The ritual begins
      </div>
    </section>
  );
}
