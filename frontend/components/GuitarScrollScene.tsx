"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { guitarChapters, projectGuitarAnchor } from "@/lib/guitarAnatomy";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function GuitarBackdrop({ targetId = "chordly-workspace" }: { targetId?: string }) {
  const background = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const workspace = document.getElementById(targetId);
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
  }, { scope: background, dependencies: [targetId], revertOnUpdate: true });

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
  const [animated, setAnimated] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useGSAP(() => {
    const root = hero.current;
    if (!root) return;
    const media = gsap.matchMedia();
    media.add({
      motion: "(prefers-reduced-motion: no-preference)",
      desktop: "(min-width: 768px)",
      tall: "(min-width: 768px) and (min-height: 700px), (min-height: 800px)",
    }, context => {
      if (!context.conditions?.motion || !context.conditions?.tall) return;
      const desktop = Boolean(context.conditions.desktop);
      const viewport = root.querySelector<HTMLElement>(".guitar-hero-viewport")!;
      const stage = root.querySelector<HTMLElement>(".guitar-stage")!;
      const object = root.querySelector<HTMLElement>(".guitar-object")!;
      const overlay = root.querySelector<SVGSVGElement>(".guitar-anatomy-pointers")!;
      const chapters = Array.from(root.querySelectorAll<HTMLElement>(".guitar-anatomy-chapter"));
      const camera = { x: 0, y: 0, scale: 1, stageY: 0 };
      let image = { left: 0, top: 0, width: 0, height: 0 };
      let stageBounds = { left: 0, top: 0, height: 0 };
      let mobileShift = 0;
      const pointers = guitarChapters.map(chapter => chapter.parts.map((part, partIndex) => ({
        part,
        line: overlay.querySelector<SVGPolylineElement>(`[data-pointer="${chapter.id}-${partIndex}"]`)!,
        dot: overlay.querySelector<SVGCircleElement>(`[data-dot="${chapter.id}-${partIndex}"]`)!,
        marker: overlay.querySelector<SVGGElement>(`[data-marker="${chapter.id}-${partIndex}"]`)!,
        origin: { x: 0, y: 0 },
      })));

      // Cache layout on refresh. Scroll frames only project coordinates and write transforms.
      function measure() {
        stageBounds = { left: stage.offsetLeft, top: stage.offsetTop, height: stage.offsetHeight };
        image = { left: stageBounds.left + object.offsetLeft, top: stageBounds.top + object.offsetTop,
          width: object.offsetWidth, height: object.offsetHeight };
        mobileShift = desktop ? 0 : -viewport.offsetHeight * 0.42;
        overlay.setAttribute("viewBox", `0 0 ${viewport.offsetWidth} ${viewport.offsetHeight}`);
        pointers.forEach(group => group.forEach((pointer, index) => {
          pointer.origin = { x: stageBounds.left + (desktop ? 28 : 20),
            y: stageBounds.top + stageBounds.height * (index + 1) / (group.length + 1) };
        }));
      }

      let timeline: gsap.core.Timeline | undefined;
      let activeGroup = -1;
      function render() {
        object.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
        stage.style.transform = `translateY(${camera.stageY}px)`;
        pointers.forEach(group => group.forEach(pointer => {
          const anchor = projectGuitarAnchor(pointer.part, image, camera);
          anchor.y += camera.stageY;
          const start = { x: pointer.origin.x, y: pointer.origin.y + camera.stageY };
          pointer.line.setAttribute("points", `${start.x + 13},${start.y} ${start.x + 30},${start.y} ${anchor.x},${anchor.y}`);
          pointer.dot.setAttribute("cx", String(anchor.x));
          pointer.dot.setAttribute("cy", String(anchor.y));
          pointer.marker.setAttribute("transform", `translate(${start.x} ${start.y})`);
        }));
        const time = timeline?.time() ?? 0;
        const group = guitarChapters.findIndex((_, index) => {
          const start = 0.4 + index * 0.9;
          return time >= start + 0.28 && time < start + 0.98;
        });
        if (group !== activeGroup) {
          activeGroup = group;
          setCurrentGroup(group < 0 ? null : group);
          setHighlighted(null);
        }
      }

      root.classList.add("guitar-hero-animated");
      setAnimated(true);
      measure();
      const pointerGroups = Array.from(overlay.querySelectorAll<SVGGElement>(".guitar-pointer-group"));
      timeline = gsap.timeline({
        onUpdate: render,
        scrollTrigger: {
          trigger: root,
          start: "top top+=80",
          end: "bottom bottom",
          scrub: 0.65,
          invalidateOnRefresh: true,
          onRefreshInit: measure,
          onRefresh: render,
        },
      });
      timeline.to(".guitar-hero-copy", { opacity: 0, duration: 0.25 }, 0.35)
        .to(".guitar-scroll-cue", { autoAlpha: 0, duration: 0.25 }, 0.35);
      guitarChapters.forEach((chapter, index) => {
        const start = 0.4 + index * 0.9;
        const scale = desktop ? chapter.scale : Math.min(chapter.scale, 1.8);
        timeline!.to(camera, {
          x: () => (0.5 - chapter.focus.x) * image.width * scale,
          y: () => (0.5 - chapter.focus.y) * image.height * scale,
          scale, stageY: () => mobileShift, duration: 0.38, ease: "power2.inOut",
        }, start);
        timeline!.to([chapters[index], pointerGroups[index]], { opacity: 1, duration: 0.1 }, start + 0.18);
        timeline!.to([chapters[index], pointerGroups[index]], { opacity: 0, duration: 0.1 }, start + 0.98);
      });
      timeline.to(camera, { x: 0, y: 0, scale: 1, stageY: 0, duration: 0.65, ease: "power2.inOut" }, 5.9)
        .to(".guitar-hero-copy", { opacity: 1, duration: 0.35 }, 6.05)
        .to(camera, { duration: 0.3 }, 6.55);
      render();

      // The header and asynchronously loaded workspace can change the trigger's position.
      let frame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => ScrollTrigger.refresh());
      });
      observer.observe(viewport);
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        root.classList.remove("guitar-hero-animated");
        setAnimated(false);
        setCurrentGroup(null);
        object.style.removeProperty("transform");
        stage.style.removeProperty("transform");
      };
    });
    return () => media.revert();
  }, { scope: hero });

  return (
    <section ref={hero} className="guitar-hero" aria-labelledby="guitar-heading">
      <div className="guitar-hero-viewport">
        <div className="guitar-hero-copy">
          <h1 id="guitar-heading" tabIndex={-1}>
            Your chords.<br />
            <span>Your next song.</span>
          </h1>
          <p>Find music that fits the shapes you know, and discover what to play next.</p>
        </div>
        <div className="guitar-stage">
          <div className="guitar-object">
            <Image src="/images/guitar-studio.webp" alt="An acoustic guitar, from its tuning machines to its bridge and wooden body."
              width={1024} height={1536} sizes="(max-width: 767px) 90vw, 650px" priority unoptimized />
          </div>
        </div>
        <div className="guitar-anatomy">
          {guitarChapters.map((chapter, chapterIndex) => (
            <section key={chapter.id} className={`guitar-anatomy-chapter ${!animated || currentGroup === chapterIndex ? "is-current" : ""}`} aria-labelledby={`guitar-${chapter.id}`}>
              <h2 id={`guitar-${chapter.id}`}>{chapter.title}</h2>
              {animated && <p className="guitar-label-hint">Choose a label to highlight its numbered marker.</p>}
              <dl>
                {chapter.parts.map((part, index) => {
                  const label = <><span className="guitar-part-number" aria-hidden="true">{index + 1}</span>{part.name}</>;
                  return (
                    <div key={part.name}>
                      <dt>
                        {animated ? (
                          <button type="button" className={`guitar-part-label ${highlighted === part.name ? "is-highlighted" : ""}`}
                            tabIndex={currentGroup !== chapterIndex ? -1 : 0}
                            aria-pressed={highlighted === part.name} aria-describedby={`guitar-description-${chapter.id}-${index}`}
                            onPointerEnter={() => setHighlighted(part.name)} onFocus={() => setHighlighted(part.name)} onClick={() => setHighlighted(part.name)}>
                            {label}
                          </button>
                        ) : <span className="guitar-part-label">{label}</span>}
                      </dt>
                      <dd id={`guitar-description-${chapter.id}-${index}`}>{part.description}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </div>
        <svg className="guitar-anatomy-pointers" role="group" aria-label="Guitar part markers" focusable="false">
          {guitarChapters.map((chapter, chapterIndex) => (
            <g key={chapter.id} aria-hidden={currentGroup !== chapterIndex}
              className={`guitar-pointer-group ${currentGroup === chapterIndex ? "is-current" : ""} ${chapter.parts.some(part => part.name === highlighted) ? "has-highlight" : ""}`}>
              {chapter.parts.map((part, index) => (
                <g key={part.name} className={`guitar-pointer ${highlighted === part.name ? "is-highlighted" : ""}`}>
                  <polyline data-pointer={`${chapter.id}-${index}`} aria-hidden="true" />
                  <circle className="guitar-pointer-dot" data-dot={`${chapter.id}-${index}`} r="3.5" aria-hidden="true" />
                  <g data-marker={`${chapter.id}-${index}`} className="guitar-marker-control"
                    role="button" aria-label={`Highlight ${part.name}`} aria-pressed={highlighted === part.name}
                    aria-describedby={`guitar-description-${chapter.id}-${index}`}
                    tabIndex={animated && currentGroup === chapterIndex ? 0 : -1}
                    onPointerDown={event => event.preventDefault()}
                    onPointerEnter={() => setHighlighted(part.name)} onFocus={() => setHighlighted(part.name)} onClick={() => setHighlighted(part.name)}
                    onKeyDown={event => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setHighlighted(part.name);
                      }
                    }}>
                    <circle className="guitar-marker-hit-area" r="22" aria-hidden="true" />
                    <circle className="guitar-marker-badge" r="12" aria-hidden="true" />
                    <text textAnchor="middle" dominantBaseline="central" aria-hidden="true">{index + 1}</text>
                  </g>
                </g>
              ))}
            </g>
          ))}
        </svg>
        <div className="guitar-tour-navigation">
          <a className="guitar-hero-action" href="#your-chords">
            Recognize a chord <span aria-hidden="true">↗</span>
          </a>
          <a className="guitar-hero-action" href="#song-catalogue">
            Find songs <span aria-hidden="true">↗</span>
          </a>
          <p className="guitar-scroll-cue">Scroll to explore your guitar <span aria-hidden="true">↓</span></p>
        </div>
      </div>
    </section>
  );
}

export function WorkspaceFooter({ focusTargetId = "guitar-heading" }: { focusTargetId?: string }) {
  function backToTop() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
    document.getElementById(focusTargetId)?.focus({ preventScroll: true });
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
