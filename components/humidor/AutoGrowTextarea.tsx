"use client";

/* ------------------------------------------------------------------
   AutoGrowTextarea

   Textarea that resizes itself to fit its content on every change.
   Used inside the Burn Report flow so freeform fields (Review, per-
   third Notes) grow as the user writes instead of forcing a fixed
   box plus inner scroll.

   We reset height to "auto" before measuring scrollHeight so the
   measurement reflects the current content rather than the previous
   pass. `overflow: hidden` suppresses the scrollbar flicker that
   would otherwise appear for one frame between resets.
   ------------------------------------------------------------------ */

import React, { useEffect, useRef } from "react";

interface AutoGrowTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  value:       string;
  onChange:    (v: string) => void;
  /* Minimum height in px. The textarea will never collapse below
     this even when empty; useful for keeping a tap target visible. */
  minHeight?:  number;
}

export function AutoGrowTextarea({
  value,
  onChange,
  minHeight = 100,
  style,
  className = "input resize-none",
  rows = 2,
  ...rest
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [value, minHeight]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      className={className}
      style={{ minHeight, overflow: "hidden", ...style }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}
