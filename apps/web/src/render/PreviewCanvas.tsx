import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../i18n/useT";
import type { Frame } from "../timeline/timeline";
import styles from "./PreviewCanvas.module.css";
import { type FrameTexture, type ImageSource, Renderer, WebGL2UnsupportedError } from "./Renderer";
import { transitionSources } from "./shaderSource";

export interface PreviewCanvasProps {
  frame: Frame;
  /** Decoded image for the filmstrip index; `undefined` while it is loading. */
  images: (slideIndex: number) => ImageSource | undefined;
  /** Catalog parameters of a transition (`uniform float <name>`). */
  params: (transitionId: string) => Readonly<Record<string, number>>;
}

/** This many frame textures are kept between draws (most recently used). */
const FRAME_CACHE_SIZE = 8;

function isReady(source: ImageSource): boolean {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return source.complete && source.naturalWidth > 0;
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

  const draw = useCallback(() => {
    rafRef.current = 0;
    const renderer = rendererRef.current;
    if (!renderer || renderer.isContextLost) return;
    const { width, height } = sizeRef.current;
    renderer.resize(width, height, window.devicePixelRatio || 1);
    const { frame, images, params } = propsRef.current;
    if (frame.kind === "still") {
      const tex = textureFor(renderer, images(frame.slideIndex));
      if (tex) renderer.drawStill(tex);
      else renderer.drawEmpty();
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
        );
      } else if (from || to) {
        renderer.drawStill((from ?? to) as FrameTexture);
      } else {
        renderer.drawEmpty();
      }
      return;
    }
    renderer.drawEmpty();
  }, [textureFor]);

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
    return () => {
      observer?.disconnect();
      media?.removeEventListener("change", onDprChange);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      frames.clear();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [schedule]);

  // Redraw on every change of frame, images or parameters.
  // biome-ignore lint/correctness/useExhaustiveDependencies: props only trigger the redraw; they are read via propsRef.
  useEffect(() => {
    schedule();
  }, [props.frame, props.images, props.params, schedule]);

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
