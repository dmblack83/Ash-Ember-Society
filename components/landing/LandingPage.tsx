"use client";

import { Masthead } from "./Masthead";
import { Hero } from "./Hero";
import { Finale } from "./Finale";
import { LandingFooter } from "./LandingFooter";
import "./landing.css";

/* Orchestrator for the marketing landing page. Static sections render
   complete and readable with no JS; Task 6 adds the dynamically-imported
   GSAP/Lenis choreography on top as pure enhancement. */
export default function LandingPage() {
  return (
    <div className="ae-landing">
      {/* z0 atmosphere canvas + z1 vignette arrive in Task 5 */}
      <div className="vignette" aria-hidden="true" />
      <div className="tex-layer" aria-hidden="true" />
      <Masthead />
      <main>
        <Hero />
        <Finale />
      </main>
      <LandingFooter />
    </div>
  );
}
