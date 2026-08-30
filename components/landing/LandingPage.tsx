"use client";

import { useEffect, useRef } from "react";
import { Preloader } from "./Preloader";
import { Atmosphere } from "./Atmosphere";
import { Masthead } from "./Masthead";
import { BurnRail } from "./BurnRail";
import { Hero } from "./Hero";
import { BrandBand } from "./BrandBand";
import { Manifesto } from "./Manifesto";
import { ChapterCollection } from "./ChapterCollection";
import { ChapterRecord } from "./ChapterRecord";
import { ChapterCompany } from "./ChapterCompany";
import { Finale } from "./Finale";
import { LandingFooter } from "./LandingFooter";
import "./landing.css";

/* Orchestrator for the marketing landing page. Static sections render
   complete and readable with no JS; Task 6 adds the dynamically-imported
   GSAP/Lenis choreography on top as pure enhancement. */
export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = rootRef.current;
    if (!scope) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import("./motion")
      .then(({ initLandingMotion }) => initLandingMotion(scope))
      .then((fn) => {
        if (cancelled) fn();
        else cleanup = fn;
      })
      .catch(() => {
        // chunk load failure: static page stands on its own
        scope.querySelector("[data-preloader]")?.remove();
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <div className="ae-landing" ref={rootRef}>
      <Preloader />
      <Atmosphere />
      <div className="vignette" aria-hidden="true" />
      <div className="tex-layer" aria-hidden="true" />
      <Masthead />
      <BurnRail />
      <main>
        <Hero />
        <div data-manifesto-scene>
          <BrandBand />
          <Manifesto />
        </div>
        <ChapterCollection />
        <ChapterRecord />
        <ChapterCompany />
        <Finale />
      </main>
      <LandingFooter />
    </div>
  );
}
