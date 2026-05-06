"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { Menu, X, Archive, BookOpen, Compass, Users, Check } from "lucide-react";

/* ------------------------------------------------------------------
   Navbar
   ------------------------------------------------------------------ */

export function Navbar() {
  const [isScrolled, setIsScrolled]             = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "About",      href: "#philosophy" },
    { name: "Features",   href: "#features"   },
    { name: "Membership", href: "#membership" },
    // { name: "Community",  href: "#community"  }, // hidden — coming soon
  ];

  return (
    <header
      style={{
        position:             "fixed",
        top:                  0,
        left:                 0,
        right:                0,
        zIndex:               50,
        transition:           "all 0.3s",
        backgroundColor:      isScrolled ? "rgba(26,18,16,0.95)" : "transparent",
        backdropFilter:       isScrolled ? "blur(12px)" : "none",
        WebkitBackdropFilter: isScrolled ? "blur(12px)" : "none",
        borderBottom:         isScrolled ? "1px solid rgba(255,255,255,0.05)" : "1px solid transparent",
        padding:              isScrolled ? "12px 0" : "20px 0",
      }}
    >
      <div
        style={{
          maxWidth:       "1280px",
          margin:         "0 auto",
          padding:        "0 20px",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <a href="#" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <span
            style={{
              fontFamily:    "var(--font-serif)",
              fontSize:      "clamp(17px, 2.5vw, 22px)",
              fontWeight:    600,
              letterSpacing: "0.04em",
              color:         "var(--foreground)",
              transition:    "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--foreground)")}
          >
            Ash &amp; Ember
          </span>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden md:flex" style={{ alignItems: "center", gap: 32 }}>
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              style={{ fontSize: 14, fontWeight: 500, color: "var(--muted-foreground)", textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
            >
              {link.name}
            </a>
          ))}
          <a
            href="#join"
            style={{
              padding:        "10px 20px",
              fontSize:       14,
              fontWeight:     500,
              border:         "1px solid rgba(193,120,23,0.5)",
              color:          "var(--primary)",
              textDecoration: "none",
              borderRadius:   "2px",
              transition:     "all 0.3s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--primary)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--primary)"; }}
          >
            Join the Society
          </a>
        </nav>

        {/* Mobile toggle — 44px touch target */}
        <button
          type="button"
          className="md:hidden"
          onClick={() => setIsMobileMenuOpen((o) => !o)}
          aria-label="Toggle menu"
          style={{
            background: "none",
            border:     "none",
            color:      "var(--foreground)",
            cursor:     "pointer",
            padding:    "10px",
            margin:     "-10px",
            minWidth:   44,
            minHeight:  44,
            display:    "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", backgroundColor: "var(--background)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div style={{ display: "flex", flexDirection: "column", padding: "16px 20px 20px", gap: 4 }}>
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  style={{
                    fontSize:       16,
                    fontWeight:     500,
                    color:          "var(--muted-foreground)",
                    textDecoration: "none",
                    padding:        "12px 0",
                    borderBottom:   "1px solid rgba(255,255,255,0.04)",
                    minHeight:      44,
                    display:        "flex",
                    alignItems:     "center",
                  }}
                >
                  {link.name}
                </a>
              ))}
              <a
                href="#join"
                onClick={() => setIsMobileMenuOpen(false)}
                style={{
                  marginTop:       12,
                  padding:         "14px",
                  textAlign:       "center",
                  fontSize:        15,
                  fontWeight:      500,
                  backgroundColor: "var(--primary)",
                  color:           "#fff",
                  textDecoration:  "none",
                  borderRadius:    "2px",
                  minHeight:       44,
                  display:         "flex",
                  alignItems:      "center",
                  justifyContent:  "center",
                }}
              >
                Join the Society
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ------------------------------------------------------------------
   Hero
   ------------------------------------------------------------------ */

export function Hero() {
  return (
    <section
      style={{
        position:       "relative",
        minHeight:      "100svh",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        paddingTop:     64,
        overflow:       "hidden",
      }}
    >
      {/* Background image */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Image
          src="https://images.unsplash.com/photo-1528459105426-b9548367069b?auto=format&fit=crop&q=80&w=1920"
          alt="Cigars resting on aged wood"
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "center" }}
        />
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(18,18,18,0.80)", mixBlendMode: "multiply" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #121212 0%, rgba(18,18,18,0.6) 50%, transparent 100%)" }} />
      </div>

      {/* Content */}
      <div
        style={{
          position:  "relative",
          zIndex:    10,
          maxWidth:  860,
          width:     "100%",
          margin:    "0 auto",
          padding:   "0 20px",
          textAlign: "center",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ height: 1, width: 32, backgroundColor: "rgba(193,120,23,0.5)" }} />
            <span style={{ color: "var(--primary)", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase" }}>
              Est. 2026
            </span>
            <div style={{ height: 1, width: 32, backgroundColor: "rgba(193,120,23,0.5)" }} />
          </div>

          <h1
            style={{
              fontFamily:   "var(--font-serif)",
              fontSize:     "clamp(36px, 8vw, 88px)",
              fontWeight:   500,
              color:        "var(--foreground)",
              lineHeight:   1.1,
              marginBottom: 24,
            }}
          >
            Where Passion{" "}
            <br className="hidden sm:block" />
            <em style={{ color: "rgba(193,120,23,0.9)", fontStyle: "italic" }}>Meets Tradition</em>
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          style={{
            fontSize:     "clamp(15px, 2.2vw, 20px)",
            color:        "var(--muted-foreground)",
            maxWidth:     560,
            margin:       "0 auto 36px",
            fontWeight:   300,
            lineHeight:   1.7,
          }}
        >
          An exclusive digital sanctuary for the modern aficionado. Track your
          collection, refine your palate, and connect with a society of
          discerning enthusiasts.
        </motion.p>

        {/* Buttons: stacked on mobile, side-by-side on sm+ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          className="flex flex-col sm:flex-row"
          style={{ gap: 14, justifyContent: "center", alignItems: "stretch" }}
        >
          <a
            href="#join"
            style={{
              padding:         "15px 32px",
              backgroundColor: "var(--primary)",
              color:           "#fff",
              fontWeight:      500,
              textDecoration:  "none",
              borderRadius:    "2px",
              transition:      "background-color 0.3s",
              textAlign:       "center",
              fontSize:        15,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--gold)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--primary)")}
          >
            Request Invitation
          </a>
          <a
            href="#philosophy"
            style={{
              padding:        "15px 32px",
              border:         "1px solid rgba(255,255,255,0.2)",
              color:          "var(--foreground)",
              textDecoration: "none",
              borderRadius:   "2px",
              transition:     "all 0.3s",
              textAlign:      "center",
              fontSize:       15,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(193,120,23,0.5)"; e.currentTarget.style.color = "var(--gold)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; e.currentTarget.style.color = "var(--foreground)"; }}
          >
            Discover the Society
          </a>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="hidden sm:flex"
        style={{
          position:      "absolute",
          bottom:        32,
          left:          "50%",
          transform:     "translateX(-50%)",
          flexDirection: "column",
          alignItems:    "center",
          gap:           8,
        }}
      >
        <span style={{ fontSize: 11, color: "var(--muted-foreground)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
          Scroll
        </span>
        <div style={{ width: 1, height: 40, background: "linear-gradient(to bottom, rgba(193,120,23,0.5), transparent)" }} />
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Philosophy
   ------------------------------------------------------------------ */

export function Philosophy() {
  return (
    <section
      id="philosophy"
      style={{ padding: "clamp(56px, 8vw, 96px) 20px", backgroundColor: "var(--background)", position: "relative" }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
            gap:                 "clamp(36px, 5vw, 64px)",
            alignItems:          "center",
          }}
        >
          {/* Text — order 1 on mobile so it's first; lg: stays in DOM order (left col) */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div style={{ width: 64, height: 1, backgroundColor: "var(--primary)", marginBottom: 28 }} />
            <h2
              style={{
                fontFamily:   "var(--font-serif)",
                fontSize:     "clamp(26px, 4.5vw, 52px)",
                color:        "var(--foreground)",
                marginBottom: 28,
                lineHeight:   1.2,
              }}
            >
              A return to <br />
              <em style={{ fontStyle: "italic", color: "rgba(193,120,23,0.9)" }}>craftsmanship.</em>
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {[
                "In a world obsessed with speed, the enjoyment of a fine cigar remains one of the few rituals that demands our patience. It is an art form that connects us to the earth, to history, and to each other.",
                "Ash & Ember was founded on a simple premise: the experience of a great cigar should extend beyond the final draw. We've built a digital haven that honors the analog tradition — a place to document your journey, discover hidden gems, and share a smoke & story with those who understand.",
                "No noise. No distractions. Just the pure appreciation of the leaf.",
              ].map((text, i) => (
                <p key={i} style={{ color: "var(--muted-foreground)", fontWeight: 300, lineHeight: 1.75, fontSize: "clamp(15px, 2vw, 17px)" }}>
                  {text}
                </p>
              ))}
            </div>

            <div style={{ marginTop: 36 }}>
              <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "rgba(193,120,23,0.6)", fontSize: 17 }}>
                — Dave, Founder
              </p>
            </div>
          </motion.div>

          {/* Image — hidden on mobile to keep page tight; visible md+ */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="hidden md:block"
            style={{ position: "relative" }}
          >
            <div style={{ aspectRatio: "4/5", position: "relative", overflow: "hidden", borderRadius: 2 }}>
              <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(26,18,16,0.2)", zIndex: 1, mixBlendMode: "multiply" }} />
              <Image
                src="https://media.istockphoto.com/id/1468287900/photo/close-up-of-dried-tobacco-leaves-and-fresh-hand-rolled-premium-cuban-cigars-in-the-factory.jpg?s=612x612&w=0&k=20&c=MT7eYnFF68ZPU6G07Algj8das_KEOWB75srf3bF7TNI="
                alt="Dried tobacco leaves and hand-rolled premium cigars"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                style={{ objectFit: "cover", objectPosition: "center" }}
              />
            </div>
            {/* Decorative border */}
            <div
              style={{
                position:      "absolute",
                inset:         -16,
                border:        "1px solid rgba(193,120,23,0.2)",
                zIndex:        0,
                pointerEvents: "none",
              }}
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Features
   ------------------------------------------------------------------ */

const features = [
  {
    icon:        <Archive className="w-6 h-6" style={{ color: "var(--primary)" }} />,
    title:       "Personal Humidor",
    description: "Digitally catalog your collection. Tracking inventory, aging times, and dates with elegant precision.",
  },
  {
    icon:        <BookOpen className="w-6 h-6" style={{ color: "var(--primary)" }} />,
    title:       "Tasting Journal",
    description: "Document your experiences. Record each smoke for personal use or file a Burn Report to share with the community with flavor profiles, construction notes, and pairings in a beautifully designed ledger.",
  },
  {
    icon:        <Compass className="w-6 h-6" style={{ color: "var(--primary)" }} />,
    title:       "Discovery Engine",
    description: "Unearth your next favorite smoke. Search our extensive cigar database with over 5k unique cigars or wishlist a cigar from a Burn Report that caught your attention.",
  },
  {
    icon:        <Users className="w-6 h-6" style={{ color: "var(--primary)" }} />,
    title:       "Socialize",
    description: "Gain access to our exclusive forum to connect and share a smoke & story with those who understand.",
  },
];

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
};

const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

export function Features() {
  return (
    <section
      id="features"
      style={{
        padding:         "clamp(56px, 8vw, 96px) 20px",
        backgroundColor: "var(--card)",
        borderTop:       "1px solid rgba(255,255,255,0.05)",
        borderBottom:    "1px solid rgba(255,255,255,0.05)",
        position:        "relative",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", maxWidth: 768, margin: "0 auto clamp(40px, 6vw, 80px)" }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2
              style={{
                fontFamily:   "var(--font-serif)",
                fontSize:     "clamp(24px, 4.5vw, 52px)",
                color:        "var(--foreground)",
                marginBottom: 16,
              }}
            >
              Tools for the Aficionado
            </h2>
            <p style={{ color: "var(--muted-foreground)", fontSize: "clamp(15px, 2vw, 18px)", fontWeight: 300 }}>
              We&apos;ve crafted a suite of digital instruments designed specifically
              for the nuances of cigar appreciation.
            </p>
          </motion.div>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
            gap:                 16,
          }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              style={{
                backgroundColor: "var(--background)",
                padding:         "clamp(20px, 3vw, 32px)",
                border:          "1px solid rgba(255,255,255,0.05)",
                borderRadius:    "2px",
                transition:      "border-color 0.5s",
                cursor:          "default",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(193,120,23,0.3)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.05)")}
            >
              <div
                style={{
                  width:           44,
                  height:          44,
                  borderRadius:    "50%",
                  backgroundColor: "var(--card)",
                  display:         "flex",
                  alignItems:      "center",
                  justifyContent:  "center",
                  marginBottom:    20,
                }}
              >
                {feature.icon}
              </div>
              <h3
                style={{
                  fontFamily:   "var(--font-serif)",
                  fontSize:     "clamp(17px, 2vw, 20px)",
                  color:        "var(--foreground)",
                  marginBottom: 12,
                }}
              >
                {feature.title}
              </h3>
              <p style={{ color: "var(--muted-foreground)", fontWeight: 300, fontSize: 14, lineHeight: 1.7 }}>
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Membership
   ------------------------------------------------------------------ */

const tiers = [
  {
    name:        "Enthusiast",
    price:       "Free",
    description: "For the casual smoker beginning their journey.",
    features: [
      "Digital Humidor (up to 50 cigars)",
      "Basic Tasting Journal",
      "Community Forum Access",
      "Standard Recommendations",
    ],
    buttonText:  "Join Free",
    highlighted: false,
  },
  {
    name:        "Connoisseur",
    price:       "$12",
    period:      "/month",
    description: "For the dedicated aficionado who demands the best.",
    features: [
      "Unlimited Digital Humidor",
      "Advanced Tasting Analytics",
      "Priority Event Access",
      "Exclusive Partner Discounts",
      "Private Messaging",
    ],
    buttonText:  "Apply for Membership",
    highlighted: true,
  },
  {
    name:        "Founder's Circle",
    price:       "$99",
    period:      "/year",
    description: "For the true patron of the leaf.",
    features: [
      "All Connoisseur Benefits",
      "Annual Welcome Box (3 Premium Cigars)",
      "Metal Membership Card",
      "VIP Concierge Service",
      "Early Access to App Features",
    ],
    buttonText:  "Request Invitation",
    highlighted: false,
  },
];

export function Membership() {
  return (
    <section id="membership" style={{ padding: "clamp(56px, 8vw, 96px) 20px", backgroundColor: "var(--background)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto" }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2
              style={{
                fontFamily:   "var(--font-serif)",
                fontSize:     "clamp(24px, 4.5vw, 52px)",
                color:        "var(--foreground)",
                marginBottom: 20,
              }}
            >
              Closed Beta Coming Soon
            </h2>
            <p style={{ color: "var(--muted-foreground)", fontSize: "clamp(15px, 2vw, 18px)", fontWeight: 300 }}>
              Whether you enjoy an occasional weekend smoke or maintain a
              walk-in humidor, there is a place for you in the Society.
            </p>
          </motion.div>
        </div>

        {/* Tier details — hidden until public launch
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap:                 32,
            alignItems:          "center",
          }}
        >
          {tiers.map((tier, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              style={{
                position:        "relative",
                padding:         "32px",
                borderRadius:    "2px",
                backgroundColor: "var(--card)",
                border:          tier.highlighted ? "2px solid rgba(193,120,23,0.5)" : "1px solid rgba(255,255,255,0.05)",
                boxShadow:       tier.highlighted ? "0 25px 50px rgba(193,120,23,0.05)" : "none",
                transform:       tier.highlighted ? "translateY(-16px)" : "none",
              }}
            >
              {tier.highlighted && (
                <div style={{ position: "absolute", top: 0, left: "50%", transform: "translate(-50%, -50%)", backgroundColor:"var(--primary)", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 16px", borderRadius: "2px", whiteSpace: "nowrap" }}>
                  Most Popular
                </div>
              )}
              <div style={{ marginBottom: 32 }}>
                <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 24, color: "var(--foreground)", marginBottom: 8 }}>{tier.name}</h3>
                <p style={{ color: "var(--muted-foreground)", fontSize: 14, fontWeight: 300, minHeight: 40 }}>{tier.description}</p>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 32 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 40, color: "var(--foreground)" }}>{tier.price}</span>
                {tier.period && <span style={{ color: "var(--muted-foreground)" }}>{tier.period}</span>}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 16 }}>
                {tier.features.map((feature, fIndex) => (
                  <li key={fIndex} style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 14, color: "var(--muted-foreground)" }}>
                    <Check size={20} style={{ color: "var(--primary)", flexShrink: 0 }} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup" style={{ display: "block", width: "100%", padding: "12px 16px", textAlign: "center", borderRadius: "2px", fontWeight: 500, textDecoration: "none", transition: "all 0.3s", backgroundColor: tier.highlighted ? "var(--primary)" : "transparent", color: tier.highlighted ? "#fff" : "var(--foreground)", border: tier.highlighted ? "none" : "1px solid rgba(255,255,255,0.2)" }}>
                {tier.buttonText}
              </Link>
            </motion.div>
          ))}
        </div>
        */}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Community
   ------------------------------------------------------------------ */

const stats = [
  { value: "12,400+", label: "Active Members"  },
  { value: "85,000+", label: "Cigars Logged"    },
  { value: "4.9/5",   label: "App Store Rating" },
];

const testimonials = [
  {
    quote:  "Finally, an app that understands the nuance of cigar smoking. The tasting journal has completely changed how I appreciate my collection.",
    author: "James W.",
    title:  "Connoisseur Member",
  },
  {
    quote:  "The community here is unparalleled. No snobbery, just genuine enthusiasts sharing their passion and knowledge.",
    author: "Elena R.",
    title:  "Founder's Circle",
  },
];

export function Community() {
  return (
    <section
      id="community"
      style={{
        padding:         "clamp(56px, 8vw, 96px) 20px",
        backgroundColor: "var(--card)",
        borderTop:       "1px solid rgba(255,255,255,0.05)",
        borderBottom:    "1px solid rgba(255,255,255,0.05)",
        position:        "relative",
        overflow:        "hidden",
      }}
    >
      <div
        style={{
          position:      "absolute",
          top:           0,
          right:         0,
          width:         "50%",
          height:        "100%",
          background:    "linear-gradient(to left, rgba(18,18,18,0.5), transparent)",
          pointerEvents: "none",
        }}
      />
      <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: "clamp(32px, 5vw, 64px)" }}>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(22px, 3.5vw, 40px)", color: "var(--foreground)", marginBottom: 40, lineHeight: 1.3 }}>
              Join a growing society of <br />
              <em style={{ fontStyle: "italic", color: "rgba(193,120,23,0.9)" }}>like-minded individuals.</em>
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {stats.map((stat, index) => (
                <div key={index}>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(28px, 4vw, 52px)", color: "var(--foreground)", marginBottom: 6 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                style={{ backgroundColor: "var(--background)", padding: "clamp(20px, 3vw, 32px)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "2px", position: "relative" }}
              >
                <div style={{ position: "absolute", top: 12, left: 16, fontFamily: "var(--font-serif)", fontSize: 56, color: "rgba(193,120,23,0.2)", lineHeight: 1 }}>&ldquo;</div>
                <p style={{ color: "var(--muted-foreground)", fontStyle: "italic", position: "relative", zIndex: 1, marginBottom: 20, fontSize: 15, lineHeight: 1.7 }}>
                  {testimonial.quote}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: "var(--card)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-serif)", color: "var(--primary)", fontSize: 14, flexShrink: 0 }}>
                    {testimonial.author.charAt(0)}
                  </div>
                  <div>
                    <div style={{ color: "var(--foreground)", fontWeight: 500, fontSize: 13 }}>{testimonial.author}</div>
                    <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{testimonial.title}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   CallToAction
   ------------------------------------------------------------------ */

export function CallToAction() {
  return (
    <section
      id="join"
      style={{
        padding:         "clamp(64px, 10vw, 128px) 20px",
        backgroundColor: "var(--background)",
        position:        "relative",
        overflow:        "hidden",
      }}
    >
      {/* Glow — capped to viewport so it never causes horizontal scroll */}
      <div
        style={{
          position:      "absolute",
          top:           "50%",
          left:          "50%",
          transform:     "translate(-50%, -50%)",
          width:         "min(800px, 100vw)",
          height:        "min(800px, 100vw)",
          background:    "radial-gradient(circle, rgba(193,120,23,0.05) 0%, transparent 70%)",
          borderRadius:  "50%",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div style={{ width: 64, height: 1, backgroundColor: "var(--primary)", margin: "0 auto 28px" }} />
          <h2
            style={{
              fontFamily:   "var(--font-serif)",
              fontSize:     "clamp(28px, 6vw, 64px)",
              color:        "var(--foreground)",
              marginBottom: 20,
              lineHeight:   1.15,
            }}
          >
            Your Seat at the Table{" "}
            <em style={{ fontStyle: "italic", color: "rgba(193,120,23,0.9)" }}>Awaits</em>
          </h2>
          <p style={{ color: "var(--muted-foreground)", fontSize: "clamp(15px, 2vw, 18px)", fontWeight: 300, margin: "0 auto 40px", maxWidth: 480 }}>
            Join the waitlist today to secure early access and lock in founder
            pricing before our public launch.
          </p>

          {/* Form: stacks on mobile, side-by-side on sm+ */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col sm:flex-row"
            style={{ gap: 12, maxWidth: 520, margin: "0 auto" }}
          >
            <input
              type="email"
              placeholder="Enter your email address"
              required
              style={{
                flex:            "1 1 auto",
                backgroundColor: "var(--card)",
                border:          "1px solid rgba(255,255,255,0.1)",
                color:           "var(--foreground)",
                padding:         "15px 20px",
                borderRadius:    "2px",
                fontSize:        16,
                outline:         "none",
                transition:      "border-color 0.2s",
                minWidth:        0,
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(193,120,23,0.5)")}
              onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
            />
            <button
              type="submit"
              style={{
                flex:            "0 0 auto",
                padding:         "15px 28px",
                backgroundColor: "var(--primary)",
                color:           "#fff",
                fontWeight:      500,
                borderRadius:    "2px",
                border:          "none",
                cursor:          "pointer",
                fontSize:        15,
                transition:      "background-color 0.3s",
                whiteSpace:      "nowrap",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--gold)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--primary)")}
            >
              Request Access
            </button>
          </form>
          <p style={{ fontSize: 12, color: "rgba(166,144,128,0.5)", marginTop: 14 }}>
            By joining, you agree to our terms of service. No spam, ever.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   Footer
   ------------------------------------------------------------------ */

export function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "var(--background)",
        borderTop:       "1px solid rgba(255,255,255,0.05)",
        padding:         "40px 20px",
      }}
    >
      {/* Top row: brand + nav */}
      <div
        className="flex flex-col md:flex-row"
        style={{
          maxWidth:       1280,
          margin:         "0 auto",
          gap:            24,
          alignItems:     "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 19, fontWeight: 600, letterSpacing: "0.04em", color: "var(--foreground)" }}>
          Ash &amp; Ember
        </span>

        <nav
          className="flex flex-wrap justify-center"
          style={{ gap: 20 }}
        >
          {[
            { label: "Privacy Policy", href: "#" },
            { label: "Terms of Service", href: "#" },
            { label: "Contact", href: "#" },
            { label: "Twitter", href: "#" },
            { label: "Instagram", href: "#" },
          ].map((l) => (
            <a
              key={l.label}
              href={l.href}
              style={{ fontSize: 13, color: "var(--muted-foreground)", textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>

      {/* Bottom row: copyright */}
      <div
        className="flex flex-col md:flex-row"
        style={{
          maxWidth:       1280,
          margin:         "24px auto 0",
          paddingTop:     20,
          borderTop:      "1px solid rgba(255,255,255,0.05)",
          gap:            8,
          alignItems:     "center",
          justifyContent: "space-between",
        }}
      >
        <p style={{ fontSize: 12, color: "rgba(166,144,128,0.5)", textAlign: "center" }}>
          &copy; {new Date().getFullYear()} Ash &amp; Ember Society. All rights reserved.
        </p>
        <p style={{ fontSize: 12, color: "rgba(166,144,128,0.5)", textAlign: "center" }}>
          Designed for the discerning.
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
    /* MotionConfig reducedMotion="user" honors the user's
       prefers-reduced-motion OS setting across all framer-motion
       descendants — animations become instant transitions for
       users with vestibular sensitivity / migraine triggers. */
    <MotionConfig reducedMotion="user">
      <div style={{ backgroundColor: "var(--background)", color: "var(--foreground)", minHeight: "100vh" }}>
        <Navbar />
        <main id="main-content" style={{ flexGrow: 1 }}>
          <Hero />
          <Philosophy />
          <Features />
          {/* <Membership /> — hidden until public launch */}
          {/* <Community /> — hidden until public launch */}
          <CallToAction />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
