import { useT } from "../i18n/useT";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

/** Why "Fit movie to music" changed nothing (add-music-track D8). */
export interface FitToMusicNotice {
  kind: "tooLong" | "tooShort";
  /** Length of the music (s) */
  music: number;
  /** Reachable maximum (`tooLong`) or minimum (`tooShort`) movie duration (s) */
  reachable: number;
}

/** Message dialog: the music length is unreachable with the current pictures. */
export function FitToMusicDialog({
  notice,
  onClose,
}: {
  notice: FitToMusicNotice | null;
  onClose: () => void;
}) {
  const { t, formatTime } = useT();
  return (
    <Dialog
      open={notice !== null}
      title={t("fitToMusic.title")}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t("common.ok")}</Button>}
    >
      {notice && (
        <p>
          {t(notice.kind === "tooLong" ? "fitToMusic.tooLong" : "fitToMusic.tooShort", {
            music: formatTime(notice.music),
            reachable: formatTime(notice.reachable),
          })}
        </p>
      )}
    </Dialog>
  );
}
