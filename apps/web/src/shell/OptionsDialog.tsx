import { useId, useState } from "react";
import { LOCALES, type Locale } from "../i18n/locale";
import { useT } from "../i18n/useT";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { canVibrate, setVibrationEnabled, vibrationEnabled } from "../ui/haptics";
import styles from "./OptionsDialog.module.css";

/**
 * Tools → Options (spec app-shell "Optionen öffnen", spec localization
 * "Wahl der Sprache"): OK applies and persists the
 * chosen language at once, Cancel discards the choice.
 */
export function OptionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Mount the form only while open so each opening starts from the current locale.
  return open ? <OptionsForm onClose={onClose} /> : null;
}

function OptionsForm({ onClose }: { onClose: () => void }) {
  const { t, locale } = useT();
  const setLocale = useAppStore((s) => s.setLocale);
  const [choice, setChoice] = useState<Locale>(locale);
  const radioName = useId();
  // "Vibration" only where the device can vibrate (add-mobile-layout D13).
  const vibration = canVibrate();
  const [vibrate, setVibrate] = useState(vibrationEnabled);

  const apply = () => {
    if (choice !== locale) setLocale(choice);
    if (vibration) setVibrationEnabled(vibrate);
    onClose();
  };

  return (
    <Dialog
      open
      title={t("options.title")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={apply}>{t("common.ok")}</Button>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
        </>
      }
    >
      <fieldset className={styles.languages}>
        <legend>{t("options.language")}</legend>
        {LOCALES.map((option) => (
          // Each language is named in itself ("Deutsch", "English") in both UIs.
          <label key={option} className={styles.language} lang={option}>
            <input
              type="radio"
              name={radioName}
              value={option}
              checked={choice === option}
              onChange={() => setChoice(option)}
            />
            {t(`language.${option}`)}
          </label>
        ))}
      </fieldset>
      {vibration ? (
        <label className={styles.option}>
          <input
            type="checkbox"
            checked={vibrate}
            onChange={(event) => setVibrate(event.target.checked)}
          />
          {t("options.vibration")}
        </label>
      ) : null}
    </Dialog>
  );
}
