import { formatClipDuration } from "../i18n/format";
import { useT } from "../i18n/useT";
import type { MediaItem } from "../lib/apiClient";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import styles from "./MediaCollection.module.css";

/** "Properties" of a collection item: file name, kind and size or duration. */
export function MediaPropertiesDialog({
  item,
  onClose,
}: {
  item: MediaItem | null;
  onClose: () => void;
}) {
  const { t, locale } = useT();
  return (
    <Dialog
      open={item !== null}
      title={item ? t("media.propertiesTitle", { name: item.filename }) : ""}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t("common.ok")}</Button>}
    >
      {item ? (
        <dl className={styles.properties}>
          <dt>{t("media.fileName")}</dt>
          <dd>{item.filename}</dd>
          <dt>{t("media.kind")}</dt>
          <dd>{t(item.kind === "image" ? "media.kindImage" : "media.kindAudio")}</dd>
          {item.kind === "image" ? (
            <>
              <dt>{t("media.size")}</dt>
              <dd>{t("media.sizeValue", { width: item.width, height: item.height })}</dd>
            </>
          ) : (
            <>
              <dt>{t("media.duration")}</dt>
              <dd>{formatClipDuration(locale, item.duration)}</dd>
            </>
          )}
        </dl>
      ) : null}
    </Dialog>
  );
}
