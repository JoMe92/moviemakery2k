/**
 * Title wizard (add-titles-and-credits design.md D6, spec titles-and-credits):
 * a modal Y2K dialog like "Save Movie", with the steps "Placement" → "Text" →
 * "Style" → "Colour" and the buttons Back/Next/Cancel. The "Style" step shows
 * a live preview in the monitor; "Finish" inserts a title element or sets the
 * overlay `title` field of the selected element.
 */
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { MessageKey } from "../i18n/types";
import { useT } from "../i18n/useT";
import type { Slide, TitleStyle } from "../lib/apiClient";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import styles from "./TitleWizard.module.css";
import {
  availablePlacements,
  CREDIT_ENTRIES_MAX,
  entryName,
  isCredits,
  lineCount,
  TITLE_COLOR_DEFAULT,
  TITLE_COLORS,
  TITLE_PLACEMENTS,
  type TitleDraft,
  type TitlePlacement,
  titleStyleById,
} from "./titleStyle";

type Step = "placement" | "text" | "style" | "color";

/**
 * Fixed text slots of the "Text" step. Both are always offered (as the
 * original's "Enter text for title" does); the style chosen in the next step
 * decides how many of them it actually uses - a one-line style takes the first.
 */
const LINE_SLOTS = ["line1", "line2"] as const;

const STEPS: readonly Step[] = ["placement", "text", "style", "color"];
const STEP_TITLES: Record<Step, MessageKey> = {
  placement: "titles.steps.placement",
  text: "titles.steps.text",
  style: "titles.steps.style",
  color: "titles.steps.color",
};

export interface TitleWizardProps {
  open: boolean;
  onClose: () => void;
  /** The title catalog; the "Style" step lists every entry. */
  catalog: readonly TitleStyle[];
  /** Currently selected storyboard element, or null — decides the placements. */
  selected: Slide | null;
  /** Show (or clear) the live preview of the "Style" step in the monitor. */
  onPreview: (draft: TitleDraft | null) => void;
  /** "Finish": insert the element or set the overlay field. */
  onApply: (placement: TitlePlacement, draft: TitleDraft) => boolean;
}

/** The wizard; its state starts fresh every time it opens. */
export function TitleWizard({ open, ...rest }: TitleWizardProps) {
  return open ? <Wizard {...rest} /> : null;
}

/** Connected to the app store: opens via `openTitleWizard()`. */
export function TitleWizardFromStore() {
  const open = useAppStore((s) => s.titleWizardOpen);
  const close = useAppStore((s) => s.closeTitleWizard);
  const catalog = useAppStore((s) => s.titles);
  const slides = useAppStore((s) => s.slides);
  const selection = useAppStore((s) => s.selection);
  const setPreview = useAppStore((s) => s.setTitlePreview);
  const applyTitle = useAppStore((s) => s.applyTitle);
  const selected = selection ? (slides.find((s) => s.id === selection.slideId) ?? null) : null;
  return (
    <TitleWizard
      open={open}
      onClose={close}
      catalog={catalog}
      selected={selected}
      onPreview={setPreview}
      onApply={applyTitle}
    />
  );
}

function Wizard({
  onClose,
  catalog,
  selected,
  onPreview,
  onApply,
}: Omit<TitleWizardProps, "open">) {
  const { t, locale } = useT();
  const available = availablePlacements(selected);
  const [step, setStep] = useState<Step>("placement");
  const [placement, setPlacement] = useState<TitlePlacement>(available[0] as TitlePlacement);
  const [lines, setLines] = useState<string[]>([""]);
  // null = never edited, so switching to a credits style carries over whatever
  // the two line fields already hold instead of starting empty.
  const [creditsText, setCreditsText] = useState<string | null>(null);
  const [styleId, setStyleId] = useState(() => catalog[0]?.id ?? "");
  const [color, setColor] = useState<string>(TITLE_COLOR_DEFAULT);

  const radioName = useId();
  const baseId = useId();
  const stepRef = useRef<HTMLElement>(null);

  const style = titleStyleById(catalog, styleId);
  const credits = style ? isCredits(style.layout) : false;
  const creditsValue = creditsText ?? lines.filter((line) => line.trim().length > 0).join("\n");
  const textLines = credits
    ? creditsValue.split("\n").slice(0, CREDIT_ENTRIES_MAX)
    : lines.slice(0, style ? lineCount(style.layout) : 1);
  const draft: TitleDraft = { lines: textLines, styleId, color };
  const hasText = textLines.some((line) => line.trim().length > 0);
  // The effect below needs the text's value, not the array's identity.
  const textKey = textLines.join("\n");

  // The "Style" step previews the draft in the monitor; leaving it ends the
  // preview, and so does closing the wizard (spec titles-and-credits).
  useEffect(() => {
    if (step !== "style" && step !== "color") {
      onPreview(null);
      return;
    }
    onPreview({ lines: textKey.split("\n"), styleId, color });
  }, [step, onPreview, styleId, color, textKey]);

  useEffect(() => () => onPreview(null), [onPreview]);

  // On step change, focus the first control (keyboard operation).
  const lastStep = useRef<Step | null>(null);
  useEffect(() => {
    if (lastStep.current !== null && lastStep.current !== step) {
      stepRef.current?.closest("dialog")?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    lastStep.current = step;
  }, [step]);

  const index = STEPS.indexOf(step);
  const canGoOn = step === "text" ? hasText : step === "style" ? Boolean(style) : true;

  const next = () => {
    if (!canGoOn) return;
    if (step === "color") {
      if (onApply(placement, draft)) onClose();
      return;
    }
    setStep(STEPS[index + 1] as Step);
  };
  const back = () => {
    if (index > 0) setStep(STEPS[index - 1] as Step);
  };

  let body: ReactNode;
  if (step === "placement") {
    body = (
      <fieldset className={styles.options}>
        <legend>{t("titles.placementPrompt")}</legend>
        {TITLE_PLACEMENTS.map((option) => {
          const enabled = available.includes(option);
          const label = t(`titles.placements.${option}`);
          const hintId = `${baseId}-hint-${option}`;
          return (
            <label
              key={option}
              className={styles.option}
              aria-disabled={enabled ? undefined : true}
            >
              <input
                data-autofocus={option === placement ? true : undefined}
                type="radio"
                name={`${radioName}-placement`}
                value={option}
                // The hint is a description, not part of the name, so the
                // option stays findable by its own label.
                aria-label={label}
                aria-describedby={hintId}
                checked={placement === option}
                disabled={!enabled}
                onChange={() => setPlacement(option)}
              />
              <span className={styles.optionLabel}>{label}</span>
              <span id={hintId} className={styles.hint}>
                {enabled
                  ? t(`titles.placementHints.${option}`)
                  : option === "on"
                    ? t("titles.needsClipSelection")
                    : t("titles.needsSelection")}
              </span>
            </label>
          );
        })}
      </fieldset>
    );
  } else if (step === "text") {
    body = credits ? (
      <>
        <p>{t("titles.creditsPrompt")}</p>
        <div className={styles.field}>
          <label htmlFor={`${baseId}-credits`}>{t("titles.creditsLabel")}</label>
          <textarea
            id={`${baseId}-credits`}
            data-autofocus
            className={styles.textarea}
            rows={6}
            value={creditsValue}
            onChange={(event) => setCreditsText(event.target.value)}
          />
        </div>
      </>
    ) : (
      <>
        <p>{t("titles.textPrompt")}</p>
        {LINE_SLOTS.map((slot, i) => (
          <div key={slot} className={styles.field}>
            <label htmlFor={`${baseId}-line-${i}`}>
              {t("titles.lineLabel", { number: i + 1 })}
            </label>
            <input
              id={`${baseId}-line-${i}`}
              data-autofocus={i === 0 ? true : undefined}
              className={styles.input}
              type="text"
              autoComplete="off"
              value={lines[i] ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setLines((prev) => {
                  const nextLines = [...prev];
                  while (nextLines.length <= i) nextLines.push("");
                  nextLines[i] = value;
                  return nextLines;
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  next();
                }
              }}
            />
          </div>
        ))}
      </>
    );
  } else if (step === "style") {
    body = (
      <>
        <p>{t("titles.stylePrompt")}</p>
        <fieldset className={styles.options}>
          <legend>{t("titles.styleLegend")}</legend>
          {catalog.map((entry) => (
            <label key={entry.id} className={styles.option}>
              <input
                data-autofocus={entry.id === styleId ? true : undefined}
                type="radio"
                name={`${radioName}-style`}
                value={entry.id}
                aria-label={entryName(entry, locale)}
                aria-describedby={`${baseId}-layout-${entry.id}`}
                checked={styleId === entry.id}
                onChange={() => setStyleId(entry.id)}
              />
              <span className={styles.optionLabel}>{entryName(entry, locale)}</span>
              <span id={`${baseId}-layout-${entry.id}`} className={styles.hint}>
                {t(`titles.layouts.${entry.layout}`)}
              </span>
            </label>
          ))}
        </fieldset>
      </>
    );
  } else {
    body = (
      <>
        <p>{t("titles.colorPrompt")}</p>
        <fieldset className={styles.options}>
          <legend>{t("titles.colorLegend")}</legend>
          {TITLE_COLORS.map((option) => (
            <label key={option} className={styles.option}>
              <input
                data-autofocus={option === color ? true : undefined}
                type="radio"
                name={`${radioName}-color`}
                value={option}
                aria-label={t(`titles.colorNames.${option}`)}
                checked={color === option}
                onChange={() => setColor(option)}
              />
              <span className={styles.swatch} style={{ background: option }} aria-hidden="true" />
              <span className={styles.optionLabel}>{t(`titles.colorNames.${option}`)}</span>
            </label>
          ))}
        </fieldset>
        <p className={styles.hint}>{t("titles.fontHint")}</p>
      </>
    );
  }

  const footer = (
    <>
      <Button disabled={index === 0} onClick={back}>
        {t("titles.back")}
      </Button>
      <Button disabled={!canGoOn} onClick={next}>
        {step === "color" ? t("titles.finish") : t("titles.next")}
      </Button>
      <Button onClick={onClose}>{t("common.cancel")}</Button>
    </>
  );

  return (
    <Dialog open title={t("titles.title")} onClose={onClose} footer={footer} sheetHeight="full">
      <section ref={stepRef} className={styles.step} aria-labelledby={`${baseId}-step`}>
        <h3 id={`${baseId}-step`} className={styles.stepTitle}>
          {t(STEP_TITLES[step])}
        </h3>
        <p className={styles.stepNumber}>
          {t("titles.stepOf", { step: index + 1, total: STEPS.length })}
        </p>
        {body}
      </section>
    </Dialog>
  );
}
