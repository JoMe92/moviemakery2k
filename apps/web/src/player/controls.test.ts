import { describe, expect, it } from "vitest";
import { buildTimeline, frameAt } from "../timeline/timeline";
import {
  advance,
  clampTime,
  DEMO_HOLD,
  demoDuration,
  demoFrame,
  isTypingTarget,
  MAX_STEP,
  nextSlideTime,
  prevSlideTime,
  STOPPED,
  shouldToggleOnSpace,
  startPlayback,
  timelineOf,
} from "./controls";

const slide = (id: string, duration = 5, t: number | null = null) => ({
  id,
  mediaId: `m${id}`,
  duration,
  transitionIn: t === null ? null : { transitionId: "fade", duration: t },
});
// Spec: drei Bilder à 5 s, zwei Übergänge à 1,25 s → 12,5 s; Bild 2 voll ab 5, Bild 3 ab 8,75.
const tl = buildTimeline([slide("1"), slide("2", 5, 1.25), slide("3", 5, 1.25)]);

describe("Steuerlogik", () => {
  it("Wiedergabe läuft mit und hält am Ende beim letzten Bild an", () => {
    let p = startPlayback(STOPPED, tl.duration);
    expect(p).toEqual({ playing: true, time: 0 });
    for (let i = 0; i < 2000 && p.playing; i++) p = advance(p, 1 / 60, tl.duration);
    expect(p).toEqual({ playing: false, time: 12.5 });
    expect(frameAt(tl, p.time)).toEqual({ kind: "still", slideIndex: 2 });
    // Erneutes Abspielen am Ende beginnt von vorn.
    expect(startPlayback(p, tl.duration)).toEqual({ playing: true, time: 0 });
  });

  it("begrenzt große Zeitsprünge und ignoriert Schritte im Pausenzustand", () => {
    expect(advance({ playing: true, time: 1 }, 5, tl.duration).time).toBe(1 + MAX_STEP);
    expect(advance({ playing: true, time: 1 }, -1, tl.duration).time).toBe(1);
    const paused = { playing: false, time: 3 };
    expect(advance(paused, 0.1, tl.duration)).toBe(paused);
  });

  it("leere Diashow: Wiedergabe startet nicht", () => {
    expect(startPlayback({ playing: false, time: 4 }, 0)).toEqual(STOPPED);
  });

  it("Suchen wird auf [0, Dauer] begrenzt", () => {
    expect(clampTime(-3, 12.5)).toBe(0);
    expect(clampTime(99, 12.5)).toBe(12.5);
    expect(clampTime(Number.NaN, 12.5)).toBe(0);
    expect(clampTime(6.1, 12.5)).toBe(6.1);
  });

  it("Spec: „Nächstes Bild“ während Bild 2 springt ans Ende des Übergangs zu Bild 3", () => {
    expect(nextSlideTime(tl, 6)).toBe(8.75);
    expect(nextSlideTime(tl, 4)).toBe(5); // mitten im Übergang zu Bild 2
    expect(nextSlideTime(tl, 0)).toBe(5);
    expect(nextSlideTime(tl, 10)).toBe(12.5); // hinter dem letzten Bild → Ende
  });

  it("„Vorheriges Bild“: Anfang des aktuellen Bildes, kurz danach das vorherige", () => {
    expect(prevSlideTime(tl, 7)).toBe(5);
    expect(prevSlideTime(tl, 5.2)).toBe(0);
    expect(prevSlideTime(tl, 12.5)).toBe(8.75);
    expect(prevSlideTime(tl, 0.3)).toBe(0);
  });

  it("berechnet die Zeitachse je Slides-Array nur einmal", () => {
    const slides = [slide("1")];
    expect(timelineOf(slides)).toBe(timelineOf(slides));
    expect(timelineOf(slides).duration).toBe(5);
  });
});

describe("Übergangsdemo", () => {
  it("zeigt A, dann den Übergang, dann B", () => {
    expect(demoDuration(1.25)).toBe(2.25);
    expect(demoFrame(0.2, "circle", 1.25)).toEqual({ kind: "still", slideIndex: 0 });
    expect(demoFrame(DEMO_HOLD + 0.625, "circle", 1.25)).toEqual({
      kind: "transition",
      fromIndex: 0,
      toIndex: 1,
      transitionId: "circle",
      progress: 0.5,
    });
    expect(demoFrame(2.25, "circle", 1.25)).toEqual({ kind: "still", slideIndex: 1 });
  });
});

describe("Leertaste", () => {
  const ctx = { dialogOpen: false, dragging: false };
  const el = (html: string) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    document.body.append(wrap);
    return wrap.firstElementChild as HTMLElement;
  };

  it("schaltet bei Fokus auf Seite, Schaltfläche oder Suchleiste", () => {
    expect(shouldToggleOnSpace({ key: " ", target: document.body }, ctx)).toBe(true);
    expect(shouldToggleOnSpace({ key: " ", target: el("<button>x</button>") }, ctx)).toBe(true);
    expect(shouldToggleOnSpace({ key: " ", target: el('<input type="range">') }, ctx)).toBe(true);
  });

  it("nicht in Eingabefeldern, Menüs, Dialogen, beim Ziehen, mit Modifikatoren oder Wiederholung", () => {
    for (const html of ['<input type="text">', "<textarea></textarea>", "<select></select>"]) {
      const target = el(html);
      expect(isTypingTarget(target)).toBe(true);
      expect(shouldToggleOnSpace({ key: " ", target }, ctx)).toBe(false);
    }
    const editable = el('<div contenteditable="true"><span>x</span></div>');
    expect(shouldToggleOnSpace({ key: " ", target: editable.firstElementChild }, ctx)).toBe(false);
    const menuItem = el('<div role="menu"><button role="menuitem">a</button></div>');
    expect(shouldToggleOnSpace({ key: " ", target: menuItem.firstElementChild }, ctx)).toBe(false);
    const body = document.body;
    expect(shouldToggleOnSpace({ key: " ", target: body }, { ...ctx, dialogOpen: true })).toBe(
      false,
    );
    expect(shouldToggleOnSpace({ key: " ", target: body }, { ...ctx, dragging: true })).toBe(false);
    expect(shouldToggleOnSpace({ key: " ", ctrlKey: true, target: body }, ctx)).toBe(false);
    expect(shouldToggleOnSpace({ key: " ", repeat: true, target: body }, ctx)).toBe(false);
    expect(shouldToggleOnSpace({ key: "Enter", target: body }, ctx)).toBe(false);
  });
});
