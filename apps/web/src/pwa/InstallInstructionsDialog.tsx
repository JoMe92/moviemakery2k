import { useT } from "../i18n/useT";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { installState, useInstallInstructionsOpen } from "./install";

/** Without a browser install dialog (iOS Safari): "Share → Add to Home Screen". */
export function InstallInstructionsDialog() {
  const { t } = useT();
  const open = useInstallInstructionsOpen();
  return (
    <Dialog
      open={open}
      title={t("install.title")}
      onClose={installState.closeInstructions}
      footer={<Button onClick={installState.closeInstructions}>{t("common.ok")}</Button>}
    >
      <p>{t("install.intro")}</p>
      <ol>
        <li>{t("install.stepShare")}</li>
        <li>{t("install.stepHomeScreen")}</li>
      </ol>
    </Dialog>
  );
}
