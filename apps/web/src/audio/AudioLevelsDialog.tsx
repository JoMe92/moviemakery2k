import { useEffect, useId, useState } from "react";
import { formatNumber } from "../i18n/format";
import { useT } from "../i18n/useT";
import { isTouchLayout, useLayoutMode } from "../shell/layoutMode";
import { CLIP_AUDIO_BALANCE } from "../store/projectOps";
import { audioBalanceGains } from "../timeline/audio";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Stepper } from "../ui/Stepper";
import styles from "./AudioLevelsDialog.module.css";

/** Touch step of the level, like the music volume (add-mobile-layout D10). */
export const LEVEL_TOUCH_STEP = 5;

export interface AudioLevelsDialogProps {
  open: boolean;
  /** The project's current level, 0–100. */
  balance: number;
  /** Applies the level; `false` = refused (the dialog stays open). */
  onConfirm: (balance: number) => boolean;
  onClose: () => void;
}

/**
 * Clip → "Audio levels…" (add-narration-and-audio-levels design.md D4): the one
 * global level between the sound of the video clips and music plus narration,
 * exactly as Movie Maker 2.x had it — one slider for the whole movie, no volume
 * per video clip. Cancel leaves the project untouched.
 */
export function AudioLevelsDialog({ open, balance, onConfirm, onClose }: AudioLevelsDialogProps) {
  const { t, locale } = useT();
  const sliderId = useId();
  const hintId = useId();
  const [value, setValue] = useState(balance);
  const touch = isTouchLayout(useLayoutMode());

  useEffect(() => {
    if (open) setValue(balance);
  }, [open, balance]);

  const gains = audioBalanceGains(value);
  const valueText = t("audioLevels.value", {
    clip: formatNumber(locale, Math.round(gains.clip * 100)),
    musicAndNarration: formatNumber(locale, Math.round(gains.musicAndNarration * 100)),
  });

  const confirm = () => {
    if (!onConfirm(value)) return;
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={t("audioLevels.title")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={confirm}>{t("common.ok")}</Button>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
        </>
      }
    >
      {touch ? (
        <div className={styles.stepper}>
          <Stepper
            label={t("audioLevels.slider")}
            value={value}
            min={CLIP_AUDIO_BALANCE.min}
            max={CLIP_AUDIO_BALANCE.max}
            step={LEVEL_TOUCH_STEP}
            format={(v) => formatNumber(locale, v)}
            onChange={setValue}
          />
        </div>
      ) : null}
      <div className={styles.scale}>
        <span>{t("audioLevels.musicAndNarration")}</span>
        <span>{t("audioLevels.clipAudio")}</span>
      </div>
      <input
        id={sliderId}
        className={styles.slider}
        type="range"
        min={CLIP_AUDIO_BALANCE.min}
        max={CLIP_AUDIO_BALANCE.max}
        step={touch ? LEVEL_TOUCH_STEP : 1}
        value={value}
        aria-label={t("audioLevels.slider")}
        aria-valuetext={valueText}
        aria-describedby={hintId}
        onChange={(event) => setValue(Number(event.target.value))}
      />
      <p className={styles.value}>{valueText}</p>
      <p id={hintId} className={styles.hint}>
        {t("audioLevels.hint")}
      </p>
    </Dialog>
  );
}
