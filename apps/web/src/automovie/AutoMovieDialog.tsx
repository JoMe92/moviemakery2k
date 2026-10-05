import { useId, useState } from "react";
import { useT } from "../i18n/useT";
import { ConfirmDialog } from "../shell/AppDialogs";
import { projectMusicDuration } from "../store/appStore";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import styles from "./AutoMovieDialog.module.css";
import { isStyleAvailable } from "./autoMovie";

/**
 * Extras → "AutoMovie…" (add-automovie design.md D3, spec automovie
 * "AutoMovie-Dialog"): film title, then one of the three styles as tiles with
 * a short description. A style that needs a music track is disabled while the
 * project has none. "Erstellen" asks first if the filmstrip is not empty,
 * exactly like Datei → "Neues Projekt", because AutoMovie replaces it; the
 * media collection is never touched.
 */
export function AutoMovieDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Mount the form only while open so each opening starts empty.
  return open ? <AutoMovieForm onClose={onClose} /> : null;
}

function AutoMovieForm({ onClose }: { onClose: () => void }) {
  const { t, locale } = useT();
  const availableStyles = useAppStore((s) => s.automovieStyles);
  const hasMusic = useAppStore((s) => projectMusicDuration(s.music, s.media) > 0);
  const hasSlides = useAppStore((s) => s.slides.length > 0);
  const autoMovie = useAppStore((s) => s.autoMovie);
  const notify = useAppStore((s) => s.notify);

  const titleId = useId();
  const radioName = useId();
  const [filmTitle, setFilmTitle] = useState("");
  // Preselect the first style the project can actually use.
  const [styleId, setStyleId] = useState(
    () => availableStyles.find((style) => isStyleAvailable(style, hasMusic))?.id ?? "",
  );
  const [confirmReplace, setConfirmReplace] = useState(false);

  const chosen = availableStyles.find((style) => style.id === styleId);
  const canCreate = chosen !== undefined && isStyleAvailable(chosen, hasMusic);

  const create = () => {
    if (!chosen) return;
    setConfirmReplace(false);
    if (autoMovie(chosen.id, filmTitle)) notify(t("autoMovie.created"));
    onClose();
  };

  const submit = () => {
    if (!canCreate) return;
    // Not empty: ask before replacing (spec automovie "Rückfrage vor dem Ersetzen").
    if (hasSlides) setConfirmReplace(true);
    else create();
  };

  return (
    <>
      <Dialog
        open={!confirmReplace}
        title={t("autoMovie.title")}
        onClose={onClose}
        footer={
          <>
            <Button onClick={submit} disabled={!canCreate}>
              {t("autoMovie.create")}
            </Button>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
          </>
        }
      >
        <div className={styles.field}>
          <label htmlFor={titleId}>{t("autoMovie.filmTitle")}</label>
          <input
            id={titleId}
            data-autofocus
            className={styles.input}
            type="text"
            autoComplete="off"
            value={filmTitle}
            onChange={(event) => setFilmTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <fieldset className={styles.styles}>
          <legend>{t("autoMovie.styleLegend")}</legend>
          {availableStyles.map((style) => {
            const usable = isStyleAvailable(style, hasMusic);
            return (
              <label
                key={style.id}
                className={styles.style}
                data-disabled={usable ? undefined : true}
              >
                <input
                  type="radio"
                  name={radioName}
                  value={style.id}
                  checked={styleId === style.id}
                  disabled={!usable}
                  onChange={() => setStyleId(style.id)}
                />
                <span className={styles.styleText}>
                  <span className={styles.styleName}>{style.names[locale]}</span>
                  <span className={styles.styleDescription}>{style.descriptions[locale]}</span>
                  {usable ? null : (
                    <span className={styles.styleHint}>{t("autoMovie.needsMusic")}</span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      </Dialog>
      <ConfirmDialog
        open={confirmReplace}
        title={t("autoMovie.replaceTitle")}
        message={t("autoMovie.replaceMessage")}
        onConfirm={create}
        onCancel={() => setConfirmReplace(false)}
      />
    </>
  );
}
