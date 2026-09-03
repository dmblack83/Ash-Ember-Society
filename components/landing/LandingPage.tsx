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
import { ChapterDevices } from "./ChapterDevices";
import { Finale } from "./Finale";
import { LandingFooter } from "./LandingFooter";
import "./landing.css";

const PRELOADER_STALL_MS = 5000;

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
    // Stall guard: on a slow network the motion chunk can take a while to
    // arrive. This only covers stalls (never resolves/rejects), not
    // failures — those are handled by the existing .catch below.
    const stallTimer = window.setTimeout(() => {
      scope.querySelector("[data-preloader]")?.remove();
    }, PRELOADER_STALL_MS);
    import("./motion")
      .then(({ initLandingMotion }) => initLandingMotion(scope))
      .then((fn) => {
        window.clearTimeout(stallTimer);
        if (cancelled) fn();
        else cleanup = fn;
      })
      .catch(() => {
        window.clearTimeout(stallTimer);
        // chunk load failure: static page stands on its own
        scope.querySelector("[data-preloader]")?.remove();
      });
    return () => {
      window.clearTimeout(stallTimer);
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
      <main id="main-content">
        <Hero />
        <div data-manifesto-scene>
          <BrandBand />
          <Manifesto />
        </div>
        <ChapterCollection />
        <ChapterRecord />
        <ChapterCompany />
        <ChapterDevices />
        <Finale />
      </main>
      <LandingFooter />
    </div>
  );
}
