import { useT } from "../i18n/useT";
import { TRANSITION_DURATION } from "../store/projectOps";
import { useAppStore } from "../store/useAppStore";
import { formatDuration } from "../storyboard/dropLogic";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Stepper } from "../ui/Stepper";
import { TransitionIcon } from "./TransitionIcon";
import styles from "./TransitionSheet.module.css";
import { transitionName } from "./transitionName";

/** Step of the duration stepper in the transition sheet (design.md D9). */
export const TRANSITION_STEP = 0.25;

/**
 * Sheet "Transition" for one slot (add-mobile-layout design.md D9): "No
 * transition", every catalog entry in the UI language and the duration as a
 * stepper. Choosing sets the transition at once and plays it once in the
 * monitor; the sheet stays open until "Done".
 */
export function TransitionSheet({
  slideId,
  onClose,
}: {
  slideId: string | null;
  onClose: () => void;
}) {
  const { t, locale } = useT();
  const catalog = useAppStore((s) => s.catalog);
  const current = useAppStore((s) =>
    slideId ? (s.slides.find((x) => x.id === slideId)?.transitionIn ?? null) : null,
  );
  const setTransition = useAppStore((s) => s.setTransition);
  const removeTransition = useAppStore((s) => s.removeTransition);
  const setTransitionDuration = useAppStore((s) => s.setTransitionDuration);
  const playTransitionOnce = useAppStore((s) => s.playTransitionOnce);

  return (
    <Sheet
      open={slideId !== null}
      title={t("transitionSheet.title")}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t("transitionSheet.done")}</Button>}
    >
      <ul className={styles.list} aria-label={t("transitionSheet.list")}>
        <li>
          <button
            type="button"
            className={styles.option}
            aria-pressed={current === null}
            onClick={() => slideId && removeTransition(slideId)}
          >
            <span className={styles.none} aria-hidden="true">
              –
            </span>
            {t("transitionSheet.none")}
          </button>
        </li>
        {catalog.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={styles.option}
              aria-pressed={current?.transitionId === entry.id}
              onClick={() => {
                if (!slideId) return;
                setTransition(slideId, entry.id);
                playTransitionOnce(slideId);
              }}
            >
              <TransitionIcon transitionId={entry.id} size={32} />
              {transitionName(entry, locale)}
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.duration}>
        <span>{t("transitionSheet.duration")}</span>
        <Stepper
          label={t("transitionSheet.duration")}
          value={current?.duration ?? TRANSITION_DURATION.min}
          min={TRANSITION_DURATION.min}
          max={TRANSITION_DURATION.max}
          step={TRANSITION_STEP}
          disabled={current === null}
          format={(v) => (current ? formatDuration(v, locale) : "–")}
          onChange={(v) => slideId && setTransitionDuration(slideId, v)}
        />
      </div>
    </Sheet>
  );
}
