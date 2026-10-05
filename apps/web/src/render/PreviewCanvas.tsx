import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../i18n/useT";
import { HAVE_METADATA } from "../player/controls";
import type { Frame } from "../timeline/timeline";
import styles from "./PreviewCanvas.module.css";
import {
  type EffectSpec,
  type FrameTexture,
  type ImageSource,
  Renderer,
  type TitleTransform,
  WebGL2UnsupportedError,
} from "./Renderer";
import { transitionSources } from "./shaderSource";

/**
 * One title draw of the monitor (add-titles-and-credits design.md D1-D3):
 * the rasterised source plus the position/zoom/opacity its phase asks for.
 */
export interface TitleDrawSpec {
  source: ImageSource;
  transform: TitleTransform;
  /** Phase opacity (`fade`); 1 = fully visible. */
  alpha: number;
  /** An overlay always blends; a freestanding title only while it fades. */
  blend: boolean;
  /**
   * `true` for a freestanding title element: the frame behind it is cleared
   * to black and no picture is drawn (design.md D1). `false` for an overlay
   * title, which is composited over the already-drawn frame (D2).
   */
  standalone: boolean;
  /** Texture height / frame height; a credits list is taller than the frame. */
  heightRatio?: number;
}

export interface PreviewCanvasProps {
  frame: Frame;
  /** Decoded image for the filmstrip index; `undefined` while it is loading. */
  images: (slideIndex: number) => ImageSource | undefined;
  /** Catalog parameters of a transition (`uniform float <name>`). */
  params: (transitionId: string) => Readonly<Record<string, number>>;
  /**
   * Effect of the filmstrip element (add-effects-catalog design.md D2/D4), or
   * null without one. Omitted entirely = no element carries an effect.
   */
  effects?: (slideIndex: number) => EffectSpec | null;
  /**
   * Title element or overlay title of the filmstrip element
   * (add-titles-and-credits design.md D1-D3), or null without one. Omitted
   * entirely = no element carries a title.
   */
  titles?: (slideIndex: number) => TitleDrawSpec | null;
}

/** This many frame textures are kept between draws (most recently used). */
const FRAME_CACHE_SIZE = 8;
/** Title textures kept between draws: a title and one overlay per side suffice. */
const TITLE_CACHE_SIZE = 4;

function isReady(source: ImageSource): boolean {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return source.complete && source.naturalWidth > 0;
  }
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    // A scrubbed element keeps its last decoded frame drawable while it seeks
    // to the next position, and every seek takes it back to HAVE_METADATA (1).
    // Demanding HAVE_CURRENT_DATA (2) here would blank the monitor on each
    // scrub instead of holding the previous frame (design.md D5).
    return source.readyState >= HAVE_METADATA && source.videoWidth > 0;
  }
  return source.width > 0 && source.height > 0;
}

/**
 * WebGL2 surface of the monitor. Fills the black 4:3 area, follows its
 * size (DPR-aware) and draws at most once per animation frame.
 */
export function PreviewCanvas(props: PreviewCanvasProps) {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const framesRef = useRef(new Map<ImageSource, FrameTexture>());
  const titleFramesRef = useRef(new Map<ImageSource, FrameTexture>());
  const propsRef = useRef(props);
  const sizeRef = useRef({ width: 0, height: 0 });
  const rafRef = useRef(0);
  const [unsupported, setUnsupported] = useState(false);

  propsRef.current = props;

  const textureFor = useCallback((renderer: Renderer, source: ImageSource | undefined) => {
    if (!source || !isReady(source)) return undefined;
    const frames = framesRef.current;
    let tex = frames.get(source);
    if (tex) {
      frames.delete(source); // move to the end = most recently used
    } else {
      tex = renderer.createFrame(source);
    }
    frames.set(source, tex);
    while (frames.size > FRAME_CACHE_SIZE) {
      const [oldest, old] = frames.entries().next().value as [ImageSource, FrameTexture];
      frames.delete(oldest);
      renderer.deleteFrame(old);
    }
    return tex;
  }, []);

  // Title textures keep their own cache: unlike pictures they are uploaded at
  // their natural size (`createTitleFrame`), never fitted to the buffer.
  const titleTextureFor = useCallback((renderer: Renderer, source: ImageSource | undefined) => {
    if (!source || !isReady(source)) return undefined;
    const frames = titleFramesRef.current;
    let tex = frames.get(source);
    if (tex) {
      frames.delete(source);
    } else {
      tex = renderer.createTitleFrame(source);
    }
    frames.set(source, tex);
    while (frames.size > TITLE_CACHE_SIZE) {
      const [oldest, old] = frames.entries().next().value as [ImageSource, FrameTexture];
      frames.delete(oldest);
      renderer.deleteFrame(old);
    }
    return tex;
  }, []);

  const draw = useCallback(() => {
    rafRef.current = 0;
    const renderer = rendererRef.current;
    if (!renderer || renderer.isContextLost) return;
    const { width, height } = sizeRef.current;
    // Capped buffer: ×2 at most, 1920 px wide at most (add-mobile-layout D14).
    renderer.resize(width, height, window.devicePixelRatio || 1, true);
    const { frame, images, params, effects, titles } = propsRef.current;
    const effectOf = (index: number) => effects?.(index) ?? null;
    const titleOf = (index: number) => titles?.(index) ?? null;
    /** Draws one title over whatever is already in the framebuffer. */
    const drawTitle = (spec: TitleDrawSpec) => {
      const tex = titleTextureFor(renderer, spec.source);
      if (!tex) return;
      renderer.drawTitle(tex, spec.transform, {
        blend: spec.blend,
        alpha: spec.alpha,
        heightRatio: spec.heightRatio,
      });
    };
    if (frame.kind === "still") {
      const title = titleOf(frame.slideIndex);
      if (title?.standalone) {
        // A freestanding title element: black frame, then the title itself
        // (design.md D1) - no picture and no effect pass is involved.
        renderer.drawEmpty();
        drawTitle(title);
        return;
      }
      const tex = textureFor(renderer, images(frame.slideIndex));
      if (tex) renderer.drawStill(tex, effectOf(frame.slideIndex));
      else renderer.drawEmpty();
      if (title) drawTitle(title);
      return;
    }
    if (frame.kind === "transition") {
      const from = textureFor(renderer, images(frame.fromIndex));
      const to = textureFor(renderer, images(frame.toIndex));
      if (from && to) {
        renderer.drawTransition(
          from,
          to,
          frame.transitionId,
          frame.progress,
          params(frame.transitionId),
          effectOf(frame.fromIndex),
          effectOf(frame.toIndex),
        );
      } else if (from) {
        renderer.drawStill(from, effectOf(frame.fromIndex));
      } else if (to) {
        renderer.drawStill(to, effectOf(frame.toIndex));
      } else {
        renderer.drawEmpty();
      }
      // An overlay title stays visible for the whole transition and moves by
      // its own phases, independent of it (spec titles-and-credits).
      for (const index of [frame.fromIndex, frame.toIndex]) {
        const title = titleOf(index);
        if (title && !title.standalone) drawTitle(title);
      }
      return;
    }
    renderer.drawEmpty();
  }, [textureFor, titleTextureFor]);

  const schedule = useCallback(() => {
    if (rafRef.current === 0 && rendererRef.current) {
      rafRef.current = requestAnimationFrame(draw);
    }
  }, [draw]);

  // Create/tear down the renderer; observe the size of the surface.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas);
    } catch (err) {
      if (!(err instanceof WebGL2UnsupportedError)) console.error(err);
      setUnsupported(true);
      return;
    }
    rendererRef.current = renderer;
    renderer.precompile(Object.keys(transitionSources()));

    const rect = root.getBoundingClientRect();
    sizeRef.current = { width: rect.width, height: rect.height };

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver((entries) => {
        const box = entries[entries.length - 1]?.contentRect;
        if (!box) return;
        sizeRef.current = { width: box.width, height: box.height };
        schedule();
      });
      observer.observe(root);
    }

    // DPR changes (zoom, another screen) change the pixel size without a layout change.
    let media: MediaQueryList | undefined;
    const onDprChange = () => {
      media?.removeEventListener("change", onDprChange);
      media = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
      media?.addEventListener("change", onDprChange);
      schedule();
    };
    onDprChange();

    const frames = framesRef.current;
    const titleFrames = titleFramesRef.current;
    return () => {
      observer?.disconnect();
      media?.removeEventListener("change", onDprChange);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      frames.clear();
      titleFrames.clear();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [schedule]);

  // Redraw on every change of frame, images or parameters.
  // biome-ignore lint/correctness/useExhaustiveDependencies: props only trigger the redraw; they are read via propsRef.
  useEffect(() => {
    schedule();
  }, [props.frame, props.images, props.params, props.titles, schedule]);

  return (
    <div ref={rootRef} className={styles.root}>
      {unsupported ? (
        <div className={styles.message} role="status">
          <span className={styles.messageIcon} aria-hidden="true">
            !
          </span>
          <p className={styles.messageText}>{t("player.webgl2Missing")}</p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          role="img"
          aria-label={t("player.canvas")}
        />
      )}
    </div>
  );
}
