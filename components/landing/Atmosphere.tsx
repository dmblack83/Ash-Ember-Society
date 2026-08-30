// components/landing/Atmosphere.tsx
"use client";

import { useEffect, useRef } from "react";
import { pageProgress, bloomLevel } from "@/lib/landing/scroll-math";

/* Fixed full-viewport canvas: static warm underglow, six static light
   shafts, ember bloom scaled by scroll progress, and slow smoke wisps —
   the only animated element (spec §4: no drift, no oscillation).
   Reduced motion: paint one static warm frame and stop. */

interface Wisp {
  x: number; y: number; r: number; vy: number;
  sway: number; swayAmp: number; life: number; maxLife: number;
}

const MAX_WISPS = 26;
const SPAWN_P = 0.06;
const WISP_ALPHA = 0.035;

export function Atmosphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;

    let W = 0;
    let H = 0;
    let t = 0;
    let raf = 0;
    const resize = () => {
      W = cv.width = window.innerWidth * devicePixelRatio;
      H = cv.height = window.innerHeight * devicePixelRatio;
    };
    window.addEventListener("resize", resize);
    resize();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const folds = Array.from({ length: 6 }, (_, i) => ({
      x: 0.12 + 0.15 * i,
      hue: i % 2 ? "212,160,74" : "232,100,44",
    }));
    let bloom = 1;
    const wisps: Wisp[] = [];

    const spawnWisp = () => {
      const s = W / 1600;
      wisps.push({
        x: W * (0.42 + 0.16 * Math.random()),
        y: H * (1 + 0.04 * Math.random()),
        r: (26 + 40 * Math.random()) * s,
        vy: (0.35 + 0.55 * Math.random()) * s * devicePixelRatio,
        sway: Math.random() * Math.PI * 2,
        swayAmp: (14 + 22 * Math.random()) * s,
        life: 0,
        maxLife: 420 + 360 * Math.random(),
      });
    };

    const drawWarmth = () => {
      ctx.globalCompositeOperation = "screen";
      const warm = ctx.createRadialGradient(W * 0.5, H * 0.85, 0, W * 0.5, H * 0.85, Math.max(W, H) * 0.95);
      warm.addColorStop(0, "rgba(122,80,42,.11)");
      warm.addColorStop(0.5, "rgba(84,55,30,.055)");
      warm.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    };

    const drawShaftsAndBloom = () => {
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < folds.length; i++) {
        const f = folds[i];
        const glow = 0.05 * (0.45 + 0.55 * bloom);
        const sx = 0.35 + 0.22 * Math.abs(Math.sin(i * 2.3));
        ctx.save();
        ctx.translate(f.x * W, H * 1.05);
        ctx.scale(sx, 1);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, H * 0.8);
        g.addColorStop(0, `rgba(${f.hue},${glow})`);
        g.addColorStop(0.5, `rgba(${f.hue},${glow * 0.35})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-W / sx, -H * 1.3, (2 * W) / sx, H * 1.4);
        ctx.restore();
      }
      const bl = ctx.createRadialGradient(W * 0.5, H * 1.05, 0, W * 0.5, H * 1.05, H * 0.8);
      bl.addColorStop(0, `rgba(232,100,44,${0.26 * bloom + 0.03})`);
      bl.addColorStop(0.4, `rgba(193,120,23,${0.1 * bloom})`);
      bl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bl;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    };

    const drawSmoke = () => {
      if (bloom > 0.3 && wisps.length < MAX_WISPS && Math.random() < SPAWN_P) spawnWisp();
      ctx.globalCompositeOperation = "screen";
      for (let i = wisps.length - 1; i >= 0; i--) {
        const w = wisps[i];
        w.life++;
        w.y -= w.vy;
        w.r *= 1.0035;
        if (w.life >= w.maxLife || w.y < H * 0.1) {
          wisps.splice(i, 1);
          continue;
        }
        const px = w.x + Math.sin(t * 0.0011 + w.sway) * w.swayAmp * (w.life / w.maxLife + 0.3);
        const fade = Math.sin(Math.PI * Math.min(w.life / w.maxLife, 1));
        const a = WISP_ALPHA * fade * Math.max(bloom, 0.12);
        const g = ctx.createRadialGradient(px, w.y, 0, px, w.y, w.r);
        g.addColorStop(0, `rgba(214,196,178,${a})`);
        g.addColorStop(0.6, `rgba(214,196,178,${a * 0.45})`);
        g.addColorStop(1, "rgba(214,196,178,0)");
        ctx.fillStyle = g;
        ctx.fillRect(px - w.r, w.y - w.r, w.r * 2, w.r * 2);
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const draw = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bloom = bloomLevel(pageProgress(window.scrollY, max));
      ctx.fillStyle = "#0e0a06";
      ctx.fillRect(0, 0, W, H);
      drawWarmth();
      drawShaftsAndBloom();
      drawSmoke();
      t += 16;
      raf = requestAnimationFrame(draw);
    };

    if (reduceMotion) {
      bloom = 0.6;
      ctx.fillStyle = "#0e0a06";
      ctx.fillRect(0, 0, W, H);
      drawWarmth();
      drawShaftsAndBloom();
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas id="atmo" ref={canvasRef} aria-hidden="true" />;
}
