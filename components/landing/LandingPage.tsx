"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion";

/* ------------------------------------------------------------------
   Animation helpers
   ------------------------------------------------------------------ */

function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------
   Icons (inline SVG — no extra dependency)
   ------------------------------------------------------------------ */

function FlameIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C12 2 7 8 7 13a5 5 0 0010 0c0-3-2-6-5-8z"
        fill="var(--ember, #E8642C)"
        opacity="0.9"
      />
      <path
        d="M12 10c0 0-2 2.5-2 4a2 2 0 004 0c0-1.5-2-4-2-4z"
        fill="var(--gold, #D4A04A)"
      />
    </svg>
  );
}

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12l5 5L19 7" stroke="var(--gold, #D4A04A)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------
   Navbar
   ------------------------------------------------------------------ */

function Navbar() {
  const [scrolled, setScrolled]     = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const navLinks = [
    { label: "Features",   href: "#features"   },
    { label: "Membership", href: "#membership" },
    { label: "Community",  href: "#community"  },
  ];

  return (
    <header
      style={{
        position:        "fixed",
        top:             0,
        left:            0,
        right:           0,
        zIndex:          50,
        transition:      "background 0.3s, border-color 0.3s, backdrop-filter 0.3s",
        backgroundColor: scrolled ? "rgba(26,18,16,0.92)" : "transparent",
        backdropFilter:  scrolled ? "blur(16px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom:    scrolled ? "1px solid rgba(61,46,35,0.6)" : "1px solid transparent",
      }}
    >
      <div
        style={{
          maxWidth:      "1200px",
          margin:        "0 auto",
          padding:       "0 24px",
          height:        "64px",
          display:       "flex",
          alignItems:    "center",
          justifyContent:"space-between",
        }}
      >
        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
          <FlameIcon size={22} />
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700, color: "var(--foreground)", letterSpacing: "0.01em" }}>
            Ash & Ember
          </span>
        </Link>

        {/* Desktop nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: 32 }} className="hidden md:flex">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{
                color:          "var(--muted-foreground)",
                fontSize:       14,
                textDecoration: "none",
                letterSpacing:  "0.02em",
                transition:     "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--foreground)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/login"
            style={{
              color:          "var(--muted-foreground)",
              fontSize:       14,
              textDecoration: "none",
              transition:     "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--foreground)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            style={{
              display:         "inline-flex",
              alignItems:      "center",
              gap:             8,
              padding:         "9px 20px",
              borderRadius:    "6px",
              background:      "linear-gradient(135deg, var(--primary), var(--gold))",
              color:           "#fff",
              fontSize:        13,
              fontWeight:      600,
              textDecoration:  "none",
              letterSpacing:   "0.04em",
              textTransform:   "uppercase",
              transition:      "opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Join Free
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden"
          onClick={() => setMenuOpen((o) => !o)}
          style={{ background: "none", border: "none", color: "var(--foreground)", cursor: "pointer", padding: 4 }}
          aria-label="Toggle menu"
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            style={{
              position:        "absolute",
              top:             "64px",
              left:            0,
              right:           0,
              backgroundColor: "rgba(26,18,16,0.98)",
              backdropFilter:  "blur(16px)",
              borderBottom:    "1px solid var(--border)",
              padding:         "16px 24px 24px",
              display:         "flex",
              flexDirection:   "column",
              gap:             8,
            }}
          >
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  color:          "var(--foreground)",
                  fontSize:       16,
                  textDecoration: "none",
                  padding:        "10px 0",
                  borderBottom:   "1px solid var(--border)",
                }}
              >
                {l.label}
              </a>
            ))}
            <Link href="/login" onClick={() => setMenuOpen(false)} style={{ color: "var(--muted-foreground)", fontSize: 16, textDecoration: "none", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              Sign In
            </Link>
            <Link
              href="/signup"
              onClick={() => setMenuOpen(false)}
              style={{
                display:       "inline-flex",
                justifyContent:"center",
                padding:       "12px",
                marginTop:     8,
                borderRadius:  "6px",
                background:    "linear-gradient(135deg, var(--primary), var(--gold))",
                color:         "#fff",
                fontSize:      14,
                fontWeight:    600,
                textDecoration:"none",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Join Free
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ------------------------------------------------------------------
   Hero
   ------------------------------------------------------------------ */

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y       = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section
      ref={ref}
      style={{
        position:       "relative",
        minHeight:      "100svh",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        overflow:       "hidden",
      }}
    >
      {/* Parallax background */}
      <motion.div
        style={{
          position:           "absolute",
          inset:              "-20%",
          backgroundImage:    "url(https://images.unsplash.com/photo-1574634534894-89d7576c8259?w=1920&q=80)",
          backgroundSize:     "cover",
          backgroundPosition: "center",
          y,
        }}
      />

      {/* Gradient overlay */}
      <div
        style={{
          position:   "absolute",
          inset:      0,
          background: "linear-gradient(180deg, rgba(26,18,16,0.55) 0%, rgba(26,18,16,0.75) 60%, rgba(26,18,16,1) 100%)",
        }}
      />

      {/* Content */}
      <motion.div
        style={{
          position:      "relative",
          textAlign:     "center",
          padding:       "0 24px",
          maxWidth:      760,
          opacity,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            8,
            padding:        "6px 16px",
            borderRadius:   "100px",
            border:         "1px solid rgba(212,160,74,0.35)",
            backgroundColor:"rgba(212,160,74,0.08)",
            marginBottom:   28,
          }}
        >
          <FlameIcon size={14} />
          <span style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold)", fontWeight: 600 }}>
            For the Serious Enthusiast
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{
            fontFamily:   "var(--font-serif)",
            fontSize:     "clamp(38px, 7vw, 72px)",
            fontWeight:   700,
            lineHeight:   1.12,
            color:        "var(--foreground)",
            marginBottom: 20,
            letterSpacing:"-0.01em",
          }}
        >
          Every Smoke Tells{" "}
          <span style={{ color: "var(--gold)" }}>a Story</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{
            fontSize:     "clamp(16px, 2.2vw, 19px)",
            color:        "rgba(245,230,211,0.75)",
            lineHeight:   1.65,
            marginBottom: 40,
            maxWidth:     560,
            margin:       "0 auto 40px",
          }}
        >
          Track your humidor, log every burn, discover cigars and local shops,
          and connect with a community of enthusiasts who share your passion.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}
        >
          <Link
            href="/signup"
            style={{
              display:        "inline-flex",
              alignItems:     "center",
              gap:            10,
              padding:        "14px 32px",
              borderRadius:   "8px",
              background:     "linear-gradient(135deg, var(--primary), var(--gold))",
              color:          "#fff",
              fontSize:       15,
              fontWeight:     700,
              textDecoration: "none",
              letterSpacing:  "0.04em",
              textTransform:  "uppercase",
              boxShadow:      "0 8px 32px rgba(193,120,23,0.35)",
              transition:     "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 12px 40px rgba(193,120,23,0.45)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "0 8px 32px rgba(193,120,23,0.35)";
            }}
          >
            <FlameIcon size={16} />
            Start Free
          </Link>
          <a
            href="#features"
            style={{
              display:        "inline-flex",
              alignItems:     "center",
              padding:        "14px 32px",
              borderRadius:   "8px",
              border:         "1px solid rgba(245,230,211,0.2)",
              backgroundColor:"rgba(245,230,211,0.06)",
              color:          "var(--foreground)",
              fontSize:       15,
              fontWeight:     500,
              textDecoration: "none",
              transition:     "border-color 0.2s, background 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(212,160,74,0.45)";
              e.currentTarget.style.backgroundColor = "rgba(212,160,74,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(245,230,211,0.2)";
              e.currentTarget.style.backgroundColor = "rgba(245,230,211,0.06)";
            }}
          >
            See What&apos;s Inside
          </a>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        style={{
          position:  "absolute",
          bottom:    32,
          left:      "50%",
          transform: "translateX(-50%)",
        }}
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            width:        1,
            height:       40,
            background:   "linear-gradient(to bottom, rgba(212,160,74,0.6), transparent)",
            borderRadius: 1,
          }}
        />
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Philosophy
   ------------------------------------------------------------------ */

function Philosophy() {
  return (
    <section style={{ padding: "120px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap:                 64,
          alignItems:          "center",
        }}
      >
        <FadeUp>
          <div
            style={{
              display:        "inline-flex",
              alignItems:     "center",
              gap:            8,
              marginBottom:   20,
              padding:        "5px 14px",
              borderRadius:   "100px",
              border:         "1px solid rgba(212,160,74,0.3)",
              backgroundColor:"rgba(212,160,74,0.07)",
            }}
          >
            <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold)", fontWeight: 600 }}>
              The Philosophy
            </span>
          </div>
          <h2
            style={{
              fontFamily:   "var(--font-serif)",
              fontSize:     "clamp(28px, 4vw, 44px)",
              fontWeight:   700,
              lineHeight:   1.2,
              color:        "var(--foreground)",
              marginBottom: 20,
            }}
          >
            A Gentleman&apos;s<br />Pursuit, Modernized
          </h2>
          <p style={{ color: "var(--muted-foreground)", lineHeight: 1.75, fontSize: 16, maxWidth: 440 }}>
            Cigar culture has always been about more than tobacco. It&apos;s the ritual,
            the patience, the conversation. Ash & Ember Society brings that tradition
            into the digital age without losing the soul of what makes it special.
          </p>
        </FadeUp>

        <FadeUp delay={0.15}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {[
              {
                title: "Curated, Not Crowded",
                body:  "4,221 cigars in our catalog, organized by brand, series, wrapper, and vitola. Find exactly what you smoked and add it to your humidor in seconds.",
              },
              {
                title: "Your Memory, Preserved",
                body:  "Every burn deserves a record. Rate draw, burn, construction, and flavor. Leave notes for your future self. Build a library of personal history.",
              },
              {
                title: "Community Worth Having",
                body:  "A members-only lounge with a real code of conduct. No spam, no noise. Just enthusiasts who take their hobby as seriously as you do.",
              },
            ].map((item) => (
              <div
                key={item.title}
                style={{
                  padding:      "20px 24px",
                  borderRadius: "10px",
                  backgroundColor:"var(--card)",
                  border:       "1px solid var(--border)",
                }}
              >
                <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--gold)", marginBottom: 8 }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.65 }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Features
   ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="4" y="8" width="20" height="15" rx="2.5" stroke="var(--gold)" strokeWidth="1.8" />
        <path d="M4 13h20" stroke="var(--gold)" strokeWidth="1.5" />
        <path d="M9 5.5v2.5M19 5.5v2.5" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="14" cy="18" r="2" fill="var(--gold)" opacity="0.7" />
      </svg>
    ),
    title:       "Humidor Management",
    description: "Track every cigar by brand, vitola, quantity, purchase date, and price. Set aging targets and get alerts when a stick is ready.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M7 14l5 5 9-9" stroke="var(--ember)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="14" cy="14" r="10" stroke="var(--ember)" strokeWidth="1.8" opacity="0.5" />
      </svg>
    ),
    title:       "Burn Reports",
    description: "Multi-point rating system for draw, burn, construction, and flavor. Add tasting notes, pairing drinks, and smoke duration.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="10" stroke="var(--gold)" strokeWidth="1.8" />
        <path d="M18.5 9.5l-3.5 7-7 3.5 3.5-7 7-3.5z" stroke="var(--gold)" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="14" cy="14" r="1.8" fill="var(--gold)" />
      </svg>
    ),
    title:       "Cigar Catalog",
    description: "Browse 4,221 cigars with wrapper details, vitola specs, and real community usage data. Add anything to your humidor instantly.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 3c0 0-6.5 7.5-6.5 12.5a6.5 6.5 0 0013 0C20.5 10.5 14 3 14 3z" stroke="var(--ember)" strokeWidth="1.8" />
        <path d="M14 13c0 0-2.5 3-2.5 5a2.5 2.5 0 005 0c0-2-2.5-5-2.5-5z" fill="var(--gold)" />
      </svg>
    ),
    title:       "Community Lounge",
    description: "Members-only forum with a real code of conduct. Share smokes, ask questions, and connect with enthusiasts in your area.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="3" y="5" width="22" height="18" rx="3" stroke="var(--gold)" strokeWidth="1.8" />
        <path d="M8 12h12M8 16h8" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title:       "Shop Directory",
    description: "Find partnered cigar shops near you with hours, amenities, lounge info, and exclusive member discounts up to 15%.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <polyline points="5,20 10,13 15,17 20,9 25,12" stroke="var(--ember)" strokeWidth="1.9" strokeLinejoin="round" fill="none" />
        <circle cx="5" cy="20" r="1.5" fill="var(--ember)" />
        <circle cx="25" cy="12" r="1.5" fill="var(--ember)" />
      </svg>
    ),
    title:       "Personal Stats",
    description: "See your smoking trends, most-smoked brands, top-rated sticks, and a full history dashboard of your cigar journey.",
  },
];

function Features() {
  return (
    <section
      id="features"
      style={{
        padding:         "100px 24px",
        backgroundColor: "var(--card)",
        borderTop:       "1px solid var(--border)",
        borderBottom:    "1px solid var(--border)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <FadeUp>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            8,
                marginBottom:   20,
                padding:        "5px 14px",
                borderRadius:   "100px",
                border:         "1px solid rgba(212,160,74,0.3)",
                backgroundColor:"rgba(212,160,74,0.07)",
              }}
            >
              <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold)", fontWeight: 600 }}>
                Everything You Need
              </span>
            </div>
            <h2
              style={{
                fontFamily:   "var(--font-serif)",
                fontSize:     "clamp(26px, 4vw, 42px)",
                fontWeight:   700,
                color:        "var(--foreground)",
                marginBottom: 16,
              }}
            >
              Built for Every Part of the Experience
            </h2>
            <p style={{ color: "var(--muted-foreground)", fontSize: 16, lineHeight: 1.65, maxWidth: 520, margin: "0 auto" }}>
              From your first stick to your thousandth burn, Ash & Ember Society grows with your collection and your palate.
            </p>
          </div>
        </FadeUp>

        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap:                 24,
          }}
        >
          {FEATURES.map((f, i) => (
            <FadeUp key={f.title} delay={i * 0.07}>
              <div
                style={{
                  padding:      "28px 24px",
                  borderRadius: "12px",
                  backgroundColor:"var(--background)",
                  border:       "1px solid var(--border)",
                  height:       "100%",
                  transition:   "border-color 0.25s, transform 0.25s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(212,160,74,0.4)";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLDivElement).style.transform = "";
                }}
              >
                <div style={{ marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 700, color: "var(--foreground)", marginBottom: 10 }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.65 }}>
                  {f.description}
                </p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Membership
   ------------------------------------------------------------------ */

const TIERS = [
  {
    name:        "Free",
    price:       "$0",
    period:      "forever",
    description: "Get started and explore the catalog.",
    highlighted: false,
    features: [
      "Up to 25 humidor items",
      "Full cigar catalog access",
      "Community feed (read-only)",
      "Basic burn reports",
      "Wishlist",
      "Personal stats",
    ],
    cta: "Start Free",
  },
  {
    name:        "Member",
    price:       "$4.99",
    period:      "per month",
    annual:      "$50/year",
    description: "The full Ash & Ember experience.",
    highlighted: true,
    features: [
      "Unlimited humidor items",
      "Community posting and replies",
      "10% discount at partner shops",
      "Member events access",
      "All free features included",
    ],
    cta: "Join as Member",
  },
  {
    name:        "Premium",
    price:       "$9.99",
    period:      "per month",
    annual:      "$100/year",
    description: "For the dedicated collector.",
    highlighted: false,
    features: [
      "Everything in Member",
      "15% discount at partner shops",
      "Exclusive premium events",
      "Early access to new features",
      "Premium badge on profile",
    ],
    cta: "Go Premium",
  },
];

function Membership() {
  return (
    <section id="membership" style={{ padding: "120px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <FadeUp>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            8,
                marginBottom:   20,
                padding:        "5px 14px",
                borderRadius:   "100px",
                border:         "1px solid rgba(212,160,74,0.3)",
                backgroundColor:"rgba(212,160,74,0.07)",
              }}
            >
              <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold)", fontWeight: 600 }}>
                Membership
              </span>
            </div>
            <h2
              style={{
                fontFamily:   "var(--font-serif)",
                fontSize:     "clamp(26px, 4vw, 42px)",
                fontWeight:   700,
                color:        "var(--foreground)",
                marginBottom: 16,
              }}
            >
              Choose Your Tier
            </h2>
            <p style={{ color: "var(--muted-foreground)", fontSize: 16, lineHeight: 1.65, maxWidth: 480, margin: "0 auto" }}>
              Start free and upgrade anytime. Annual plans save 17% compared to monthly billing.
            </p>
          </div>
        </FadeUp>

        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap:                 24,
            alignItems:          "stretch",
          }}
        >
          {TIERS.map((tier, i) => (
            <FadeUp key={tier.name} delay={i * 0.1}>
              <div
                style={{
                  position:        "relative",
                  padding:         tier.highlighted ? "36px 28px" : "32px 28px",
                  borderRadius:    "14px",
                  backgroundColor: tier.highlighted ? "var(--card)" : "var(--card)",
                  border:          tier.highlighted ? "1.5px solid var(--gold)" : "1px solid var(--border)",
                  boxShadow:       tier.highlighted ? "0 0 40px rgba(212,160,74,0.12)" : "none",
                  height:          "100%",
                  display:         "flex",
                  flexDirection:   "column",
                }}
              >
                {tier.highlighted && (
                  <div
                    style={{
                      position:      "absolute",
                      top:           -12,
                      left:          "50%",
                      transform:     "translateX(-50%)",
                      padding:       "4px 16px",
                      borderRadius:  "100px",
                      background:    "linear-gradient(135deg, var(--primary), var(--gold))",
                      color:         "#fff",
                      fontSize:      11,
                      fontWeight:    700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      whiteSpace:    "nowrap",
                    }}
                  >
                    Most Popular
                  </div>
                )}

                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-foreground)", fontWeight: 600, marginBottom: 8 }}>
                    {tier.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                    <span style={{ fontFamily: "var(--font-serif)", fontSize: 40, fontWeight: 700, color: "var(--foreground)" }}>
                      {tier.price}
                    </span>
                    <span style={{ fontSize: 14, color: "var(--muted-foreground)" }}>/{tier.period}</span>
                  </div>
                  {tier.annual && (
                    <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                      or {tier.annual} (save 17%)
                    </div>
                  )}
                  <p style={{ marginTop: 12, fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                    {tier.description}
                  </p>
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  {tier.features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "var(--foreground)" }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}><CheckIcon size={16} /></span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  style={{
                    display:        "block",
                    textAlign:      "center",
                    padding:        "13px",
                    borderRadius:   "8px",
                    background:     tier.highlighted
                      ? "linear-gradient(135deg, var(--primary), var(--gold))"
                      : "transparent",
                    border:         tier.highlighted ? "none" : "1px solid var(--border)",
                    color:          tier.highlighted ? "#fff" : "var(--foreground)",
                    fontSize:       14,
                    fontWeight:     600,
                    textDecoration: "none",
                    transition:     "opacity 0.2s, border-color 0.2s",
                    letterSpacing:  "0.02em",
                  }}
                  onMouseEnter={(e) => {
                    if (tier.highlighted) {
                      e.currentTarget.style.opacity = "0.88";
                    } else {
                      e.currentTarget.style.borderColor = "var(--gold)";
                      e.currentTarget.style.color = "var(--gold)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.color = tier.highlighted ? "#fff" : "var(--foreground)";
                  }}
                >
                  {tier.cta}
                </Link>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Community
   ------------------------------------------------------------------ */

const STATS = [
  { value: "4,221", label: "Cigars in catalog" },
  { value: "500+",  label: "Partner shops" },
  { value: "5-star", label: "Curator-reviewed" },
];

const TESTIMONIALS = [
  {
    quote:  "Finally an app that takes this hobby as seriously as I do. The burn report system alone is worth the membership.",
    author: "Marcus R.",
    detail: "Member since 2025 | 180 smokes logged",
  },
  {
    quote:  "I&apos;ve tried every cigar app out there. Nothing comes close to the humidor management and the community here.",
    author: "Derek P.",
    detail: "Premium member | 420 cigars tracked",
  },
  {
    quote:  "The shop directory found me three great lounges I had no idea existed in my city. Game changer.",
    author: "Thomas A.",
    detail: "Member | Utah Chapter",
  },
];

function Community() {
  return (
    <section
      id="community"
      style={{
        padding:         "120px 24px",
        backgroundColor: "var(--card)",
        borderTop:       "1px solid var(--border)",
        borderBottom:    "1px solid var(--border)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Stats */}
        <FadeUp>
          <div
            style={{
              display:             "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap:                 32,
              marginBottom:        80,
              textAlign:           "center",
            }}
          >
            {STATS.map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 700, color: "var(--gold)", marginBottom: 8 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 14, color: "var(--muted-foreground)", letterSpacing: "0.04em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </FadeUp>

        {/* Section header */}
        <FadeUp>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2
              style={{
                fontFamily:   "var(--font-serif)",
                fontSize:     "clamp(26px, 4vw, 42px)",
                fontWeight:   700,
                color:        "var(--foreground)",
                marginBottom: 12,
              }}
            >
              What Members Are Saying
            </h2>
            <p style={{ color: "var(--muted-foreground)", fontSize: 16 }}>
              From serious collectors to weekend enthusiasts.
            </p>
          </div>
        </FadeUp>

        {/* Testimonials */}
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap:                 24,
          }}
        >
          {TESTIMONIALS.map((t, i) => (
            <FadeUp key={t.author} delay={i * 0.1}>
              <div
                style={{
                  padding:         "28px 24px",
                  borderRadius:    "12px",
                  backgroundColor: "var(--background)",
                  border:          "1px solid var(--border)",
                }}
              >
                <div style={{ fontSize: 28, color: "var(--gold)", opacity: 0.5, marginBottom: 12, fontFamily: "var(--font-serif)" }}>&ldquo;</div>
                <p
                  style={{
                    fontSize:     15,
                    color:        "var(--foreground)",
                    lineHeight:   1.7,
                    marginBottom: 20,
                    opacity:      0.9,
                  }}
                  dangerouslySetInnerHTML={{ __html: t.quote }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{t.author}</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{t.detail}</div>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Call to Action
   ------------------------------------------------------------------ */

function CallToAction() {
  return (
    <section style={{ padding: "120px 24px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
        <FadeUp>
          <div
            style={{
              display:        "inline-flex",
              alignItems:     "center",
              gap:            10,
              marginBottom:   28,
            }}
          >
            <FlameIcon size={32} />
            <FlameIcon size={20} />
            <FlameIcon size={32} />
          </div>
          <h2
            style={{
              fontFamily:   "var(--font-serif)",
              fontSize:     "clamp(28px, 5vw, 52px)",
              fontWeight:   700,
              lineHeight:   1.15,
              color:        "var(--foreground)",
              marginBottom: 20,
            }}
          >
            Your Humidor Deserves<br />Better Than a Spreadsheet
          </h2>
          <p style={{ color: "var(--muted-foreground)", fontSize: 17, lineHeight: 1.65, marginBottom: 44 }}>
            Join free. No credit card required. Start tracking your collection today
            and upgrade when you&apos;re ready for the full experience.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/signup"
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            10,
                padding:        "15px 36px",
                borderRadius:   "8px",
                background:     "linear-gradient(135deg, var(--primary), var(--gold))",
                color:          "#fff",
                fontSize:       15,
                fontWeight:     700,
                textDecoration: "none",
                letterSpacing:  "0.04em",
                textTransform:  "uppercase",
                boxShadow:      "0 8px 32px rgba(193,120,23,0.3)",
                transition:     "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 12px 40px rgba(193,120,23,0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = "0 8px 32px rgba(193,120,23,0.3)";
              }}
            >
              <FlameIcon size={16} />
              Create Free Account
            </Link>
            <Link
              href="/login"
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                padding:        "15px 36px",
                borderRadius:   "8px",
                border:         "1px solid var(--border)",
                color:          "var(--muted-foreground)",
                fontSize:       15,
                fontWeight:     500,
                textDecoration: "none",
                transition:     "border-color 0.2s, color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--gold)";
                e.currentTarget.style.color = "var(--foreground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--muted-foreground)";
              }}
            >
              Sign In
            </Link>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Footer
   ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer
      style={{
        borderTop:       "1px solid var(--border)",
        backgroundColor: "var(--card)",
        padding:         "48px 24px 40px",
      }}
    >
      <div
        style={{
          maxWidth:      1100,
          margin:        "0 auto",
          display:       "flex",
          flexWrap:      "wrap",
          gap:           32,
          justifyContent:"space-between",
          alignItems:    "flex-start",
        }}
      >
        {/* Brand */}
        <div style={{ maxWidth: 280 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <FlameIcon size={18} />
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>
              Ash & Ember Society
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.65 }}>
            The premium cigar enthusiast app. Built for those who take their hobby seriously.
          </p>
        </div>

        {/* Links */}
        <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-foreground)", fontWeight: 700, marginBottom: 14 }}>
              App
            </div>
            {["Features", "Membership", "Community"].map((l) => (
              <a
                key={l}
                href={`#${l.toLowerCase()}`}
                style={{ display: "block", fontSize: 14, color: "var(--muted-foreground)", textDecoration: "none", marginBottom: 10, transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--foreground)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
              >
                {l}
              </a>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-foreground)", fontWeight: 700, marginBottom: 14 }}>
              Account
            </div>
            {[
              { label: "Sign In",    href: "/login"  },
              { label: "Sign Up",    href: "/signup" },
            ].map((l) => (
              <Link
                key={l.label}
                href={l.href}
                style={{ display: "block", fontSize: 14, color: "var(--muted-foreground)", textDecoration: "none", marginBottom: 10, transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--foreground)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          maxWidth:   1100,
          margin:     "32px auto 0",
          paddingTop: 24,
          borderTop:  "1px solid var(--border)",
          display:    "flex",
          flexWrap:   "wrap",
          gap:        16,
          justifyContent:"space-between",
          alignItems: "center",
        }}
      >
        <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          &copy; {new Date().getFullYear()} Ash & Ember Society. All rights reserved.
        </p>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", opacity: 0.6 }}>
          Enjoy responsibly. 21+ only.
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------
   Root export
   ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <div style={{ backgroundColor: "var(--background)", color: "var(--foreground)", minHeight: "100vh" }}>
      <Navbar />
      <Hero />
      <Philosophy />
      <Features />
      <Membership />
      <Community />
      <CallToAction />
      <Footer />
    </div>
  );
}
