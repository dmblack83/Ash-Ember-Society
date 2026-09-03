/* All landing choreography. Loaded via dynamic import from LandingPage so
   gsap + ScrollTrigger + lenis (~35KB gz) never touch other routes.
   Values are a 1:1 port of mockups/landing-comps/hybrid/script.js —
   the mockup is the authoritative motion reference. */

type Cleanup = () => void;

const PRELOADER_SEEN_KEY = "ae-preloader-seen";

function splitWords(el: HTMLElement) {
  if (el.dataset.splitReady) return;
  const walk = (node: Node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        (child.textContent ?? "").split(/(\s+)/).forEach((part) => {
          if (!part.trim()) {
            frag.appendChild(document.createTextNode(part));
            return;
          }
          const mask = document.createElement("span");
          mask.className = "split-word-mask";
          const w = document.createElement("span");
          w.className = "split-word";
          w.textContent = part;
          mask.appendChild(w);
          frag.appendChild(mask);
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === 1) {
        walk(child as HTMLElement);
      }
    });
  };
  walk(el);
  el.dataset.splitReady = "true";
}

export async function initLandingMotion(scope: HTMLElement): Promise<Cleanup> {
  const removePreloader = () => scope.querySelector("[data-preloader]")?.remove();

  let gsap: typeof import("gsap").gsap;
  let ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger;
  let LenisCtor: typeof import("lenis").default;
  try {
    [{ gsap }, { ScrollTrigger }, { default: LenisCtor }] = await Promise.all([
      import("gsap"),
      import("gsap/ScrollTrigger"),
      import("lenis"),
    ]);
  } catch {
    // Library-failure guard (spec §7): static page stands on its own.
    removePreloader();
    return () => {};
  }

  gsap.registerPlugin(ScrollTrigger);

  const prevScrollRestoration = history.scrollRestoration;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Lenis ----
  let lenis: InstanceType<typeof LenisCtor> | null = null;
  let lenisTick: ((t: number) => void) | null = null;
  if (!reduceMotion) {
    lenis = new LenisCtor({ lerp: 0.08, smoothWheel: true, wheelMultiplier: 0.9 });
    lenis.on("scroll", ScrollTrigger.update);
    lenisTick = (t: number) => lenis?.raf(t * 1000);
    gsap.ticker.add(lenisTick);
    gsap.ticker.lagSmoothing(0);
  }

  // ---- masthead scrolled state ----
  const masthead = scope.querySelector("[data-masthead]");
  const onScroll = () => masthead?.classList.toggle("scrolled", window.scrollY > 60);
  addEventListener("scroll", onScroll, { passive: true });

  // ---- preloader (once per session) ----
  const playPreloader = (): Promise<void> => {
    const loader = scope.querySelector("[data-preloader]");
    const bar = scope.querySelector("[data-preloader-bar]");
    if (!loader) return Promise.resolve();
    let seen = false;
    try { seen = sessionStorage.getItem(PRELOADER_SEEN_KEY) === "1"; } catch {}
    if (reduceMotion || seen) { loader.remove(); return Promise.resolve(); }
    try { sessionStorage.setItem(PRELOADER_SEEN_KEY, "1"); } catch {}
    return new Promise((resolve) => {
      gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: () => { loader.remove(); resolve(); } })
        .to(bar, { scaleX: 1, duration: 1.0 })
        .to(loader, { yPercent: -100, duration: 0.8, ease: "power4.inOut" }, "+=0.1");
    });
  };

  const ctx = gsap.context(() => {}, scope);

  const boot = () => ctx.add(() => {
    // -- hero entrance + parallax out --
    const headline = scope.querySelector<HTMLElement>("[data-hero-headline]");
    if (!reduceMotion && headline) {
      headline.querySelectorAll<HTMLElement>(".line").forEach(splitWords);
      gsap.timeline({ defaults: { ease: "power4.out" } })
        .fromTo("[data-hero-kicker]", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8 })
        .fromTo(headline.querySelectorAll(".split-word"),
          { yPercent: 135, filter: "blur(6px)" },
          { yPercent: 0, filter: "blur(0px)", duration: 1.1, stagger: 0.07 }, "-=0.5")
        .fromTo("[data-hero-deck]", { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.9 }, "-=0.6")
        .fromTo("[data-hero-ctas]", { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.9 }, "-=0.7")
        .fromTo("[data-hero-cue]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, "-=0.4");
      gsap.to(".hero > *", {
        y: -60, autoAlpha: 0.25, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 },
      });
    }

    // -- brand band seamless loop --
    const band = scope.querySelector("[data-brand-band]");
    if (band && !reduceMotion) {
      band.innerHTML += band.innerHTML;
      band.setAttribute("data-loop", "");
    }

    // -- manifesto: pinned word scrub --
    const paras = gsap.utils.toArray<HTMLElement>("[data-scrub-words]");
    paras.forEach(splitWords);
    if (!reduceMotion) {
      const words: Element[] = [];
      paras.forEach((p) => words.push(...p.querySelectorAll(".split-word")));
      gsap.fromTo(words, { opacity: 0.13 }, {
        opacity: 1, stagger: 0.6, ease: "none",
        scrollTrigger: {
          trigger: "[data-manifesto-scene]", start: "top 56px", end: "+=160%",
          scrub: 0.8, pin: true, anticipatePin: 1,
        },
      });
    }

    // -- generic once-only section reveals --
    if (reduceMotion) {
      gsap.set("[data-reveal-item]", { autoAlpha: 1 });
    } else {
      gsap.utils.toArray<HTMLElement>("[data-story-section]").forEach((section) => {
        const items = section.querySelectorAll("[data-reveal-item]");
        gsap.fromTo(items.length ? items : section.children,
          { y: 36, autoAlpha: 0, filter: "blur(8px)" },
          { y: 0, autoAlpha: 1, filter: "blur(0px)", duration: 1, ease: "power4.out", stagger: 0.09,
            scrollTrigger: { trigger: section, start: "top 80%", once: true } });
      });
    }

    // -- CH1: pinned humidor scene, step + visual pairs --
    const humidorScene = scope.querySelector("[data-humidor-scene]");
    if (reduceMotion || innerWidth < 900) {
      gsap.set("[data-scene-phone], [data-scene-sat], [data-scene-step]", { autoAlpha: 1 });
    } else if (humidorScene) {
      const steps = gsap.utils.toArray<HTMLElement>("[data-scene-step]");
      gsap.timeline({
        scrollTrigger: { trigger: humidorScene, start: "top top", end: "+=200%", scrub: 1.1, pin: true, anticipatePin: 1 },
      })
        .fromTo(steps[0], { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, ease: "none", duration: 0.22 }, 0)
        .fromTo("[data-scene-phone]", { y: 90, autoAlpha: 0, rotate: -3 },
          { y: 0, autoAlpha: 1, rotate: 0, ease: "none", duration: 0.26 }, 0)
        .fromTo(steps[1], { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, ease: "none", duration: 0.22 }, 0.37)
        .fromTo(".sat-env", { autoAlpha: 0, y: 40, scale: 0.94 },
          { autoAlpha: 1, y: 0, scale: 1, ease: "none", duration: 0.26 }, 0.37)
        .fromTo(steps[2], { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, ease: "none", duration: 0.22 }, 0.72)
        .fromTo(".sat-age", { autoAlpha: 0, y: 40, scale: 0.94 },
          { autoAlpha: 1, y: 0, scale: 1, ease: "none", duration: 0.26 }, 0.72);
    }

    // -- CH2: pinned burn deck --
    const burnScene = scope.querySelector("[data-burn-scene]");
    const cards = gsap.utils.toArray<HTMLElement>("[data-burn-stage] .burn-card");
    if (reduceMotion || innerWidth < 900) {
      gsap.set(cards, { clearProps: "all", autoAlpha: 1 });
    } else if (burnScene && cards.length === 3) {
      gsap.set(cards, { y: () => innerHeight });
      gsap.timeline({
        scrollTrigger: { trigger: burnScene, start: "top top", end: "+=200%", scrub: 1.1, pin: true, anticipatePin: 1,
          invalidateOnRefresh: true },
      })
        .to(cards[0], { y: 0, ease: "none", duration: 0.2 }, 0.03)
        .to(cards[0], { scale: 0.97, y: -46, autoAlpha: 0.8, ease: "none", duration: 0.22 }, 0.38)
        .to(cards[1], { y: 0, ease: "none", duration: 0.24 }, 0.38)
        .to(cards[0], { scale: 0.94, y: -84, autoAlpha: 0.5, ease: "none", duration: 0.22 }, 0.72)
        .to(cards[1], { scale: 0.97, y: -46, autoAlpha: 0.8, ease: "none", duration: 0.22 }, 0.72)
        .to(cards[2], { y: 0, ease: "none", duration: 0.24 }, 0.72);
    }

    // -- footer reveal --
    if (!reduceMotion) {
      gsap.fromTo("[data-footer-parallax]", { yPercent: -10, autoAlpha: 0.85 }, {
        yPercent: 0, autoAlpha: 1, ease: "none",
        scrollTrigger: { trigger: "[data-footer-parallax]", start: "top bottom", end: "top 60%", scrub: 1 },
      });
    }

    ScrollTrigger.refresh();
  });

  /* Boot order (spec §5 hard requirement): preloader AND fonts.ready
     resolve BEFORE any ScrollTrigger exists, so pin positions are
     measured against final glyph metrics. */
  await Promise.all([playPreloader(), document.fonts.ready]);
  boot();
  /* The pin spacers created in boot() add ~5 viewport-heights to the page
     AFTER Lenis measured it; Lenis 1.3 clamps wheel scroll to its cached
     limit, freezing scroll mid-CH1 until it re-measures. */
  lenis?.resize();
  const onLoad = () => {
    ScrollTrigger.refresh();
    lenis?.resize();
  };
  addEventListener("load", onLoad);

  return () => {
    removeEventListener("load", onLoad);
    removeEventListener("scroll", onScroll);
    ctx.revert();
    ScrollTrigger.getAll().forEach((st) => st.kill());
    if (lenisTick) gsap.ticker.remove(lenisTick);
    lenis?.destroy();
    history.scrollRestoration = prevScrollRestoration;
  };
}
