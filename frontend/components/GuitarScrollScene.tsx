"use client";

import { useRef } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function GuitarBackdrop() {
  const background = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const workspace = document.getElementById("chordly-workspace");
      if (!workspace) return;
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: workspace,
          start: "top top",
          end: "bottom bottom",
          scrub: 1.4,
          invalidateOnRefresh: true,
        },
      });
      timeline
        .fromTo(".guitar-background-portrait",
          { xPercent: 12, yPercent: 4, rotation: -12, rotationY: -10, z: -60, scale: 1, opacity: 0.15 },
          { xPercent: -22, yPercent: -14, rotation: 10, rotationY: 14, z: 70, scale: 1.14, opacity: 0.03, duration: 1, ease: "none" }, 0)
        .fromTo(".guitar-background-macro",
          { xPercent: -10, yPercent: 16, rotation: 14, rotationY: 12, z: -80, scale: 0.9, opacity: 0 },
          { xPercent: 14, yPercent: -9, rotation: -7, rotationY: -12, z: 40, scale: 1.12, opacity: 0.13, duration: 1, ease: "none" }, 0);

      let refreshFrame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(refreshFrame);
        refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
      });
      observer.observe(workspace);
      return () => {
        observer.disconnect();
        cancelAnimationFrame(refreshFrame);
      };
    });
    return () => media.revert();
  }, { scope: background });

  return (
    <div className="guitar-atmosphere" ref={background} aria-hidden="true">
      <div className="guitar-background-portrait" />
      <div className="guitar-background-macro" />
      <div className="guitar-background-shade" />
    </div>
  );
}

export function GuitarScrollHero() {
  const hero = useRef<HTMLElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add({
      motion: "(prefers-reduced-motion: no-preference)",
      desktop: "(min-width: 768px)",
    }, context => {
      if (!context.conditions?.motion) return;
      const distance = context.conditions.desktop ? 1 : 0.45;
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: hero.current,
          start: "top top+=80",
          end: "bottom top",
          scrub: 0.9,
          invalidateOnRefresh: true,
        },
      });
      timeline
        .fromTo(".guitar-object", { rotationY: -12, rotationX: 5, rotationZ: -7, scale: 0.94 },
          { rotationY: 18, rotationX: -8, rotationZ: 6, scale: 1.04, y: 65 * distance, duration: 1, ease: "none" }, 0)
        .to(".guitar-part-body", { x: -60 * distance, y: 45 * distance, z: 100, rotationY: -14, rotationZ: -7, duration: 0.8, ease: "none" }, 0.12)
        .to(".guitar-part-neck", { x: 25 * distance, y: -15 * distance, z: 160, rotationY: 7, rotationZ: 4, duration: 0.8, ease: "none" }, 0.12)
        .to(".guitar-part-head", { x: 65 * distance, y: -55 * distance, z: 220, rotationY: 12, rotationZ: 9, duration: 0.8, ease: "none" }, 0.12)
        .to(".guitar-orbit", { rotationX: 68, rotationZ: 40, scale: 1.15, opacity: 0, duration: 1, ease: "none" }, 0)
        .to(".guitar-hero-copy", { y: -30 * distance, opacity: 0.25, duration: 0.8, ease: "none" }, 0.2);
    });
    return () => media.revert();
  }, { scope: hero });

  return (
    <section ref={hero} className="guitar-hero" aria-labelledby="guitar-heading">
      <div className="guitar-hero-copy">
        <h1 id="guitar-heading" tabIndex={-1}>
          Your chords.<br />
          <span>Your next song.</span>
        </h1>
        <p>Find music that fits the shapes you know, and discover what to play next.</p>
        <a className="guitar-hero-action" href="#your-session">
          Find my next song
          <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="guitar-stage" aria-hidden="true">
        <div className="guitar-orbit" />
        <div className="guitar-object">
          {["body", "neck", "head"].map((part, index) => (
            <div key={part} className={`guitar-part guitar-part-${part}`}>
              <Image
                src="/images/guitar-studio.png"
                alt=""
                width={1024}
                height={1536}
                sizes="(max-width: 767px) 88vw, 650px"
                priority={index === 0}
                loading={index === 0 ? undefined : "eager"}
              />
            </div>
          ))}
        </div>
      </div>
      <a href="#your-session" className="guitar-scroll-cue">
        Scroll to play
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 4v16m-6-6 6 6 6-6" />
        </svg>
      </a>
    </section>
  );
}

export function WorkspaceFooter() {
  function backToTop() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
    document.getElementById("guitar-heading")?.focus({ preventScroll: true });
  }

  return (
    <footer className="workspace-footer">
      <p>Chordly</p>
      <button type="button" onClick={backToTop} className="back-to-top" aria-label="Back to top">
        <span>Back to top</span>
        <span className="back-to-top-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 20V4m-6 6 6-6 6 6" />
          </svg>
        </span>
      </button>
    </footer>
  );
}
