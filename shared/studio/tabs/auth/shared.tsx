import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import {Button, WarningIcon} from "@dbsof/common/newui";

import {AbstractDraftConfig} from "./state";

import styles from "./authAdmin.module.scss";
import {PropsWithChildren} from "react";
import {LoadingSkeleton} from "@dbsof/common/newui/loadingSkeleton";

export const secretPlaceholder = "".padStart(32, "•");

export function StickyBottomBar({
  children,
  visible,
}: PropsWithChildren<{visible: boolean}>) {
  return (
    <div className={cn(styles.stickyBottomBar, {[styles.visible]: visible})}>
      <div className={styles.bar}>{children}</div>
    </div>
  );
}

export const StickyFormControls = observer(function StickyFormControls({
  draft,
}: {
  draft: AbstractDraftConfig;
}) {
  return (
    <StickyBottomBar visible={draft.formChanged}>
      <Button
        kind="outline"
        onClick={() => draft.clearForm()}
        style={{marginLeft: "auto"}}
      >
        Clear Changes
      </Button>

      <Button
        kind="primary"
        onClick={() => draft.update()}
        disabled={draft.formError || !draft.formChanged || draft.updating}
        loading={draft.updating}
      >
        Update
      </Button>
    </StickyBottomBar>
  );
});

export const InputSkeleton = () => (
  <LoadingSkeleton className={styles.inputSkeleton} />
);

export function EmailProviderWarning({children}: PropsWithChildren<{}>) {
  return (
    <div className={styles.emailProviderWarning}>
      <WarningIcon />
      <span>Warning:</span> {children}
    </div>
  );
}
