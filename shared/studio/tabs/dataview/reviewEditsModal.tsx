import {Fragment, useState} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import {DataView} from "./state";
import {getAllChildren} from "../../utils/syntaxTree";
import {SchemaType} from "@dbsof/common/schemaData";

import {useModal} from "@dbsof/common/hooks/useModal";
import {WarningIcon} from "../../icons";

import {
  Modal,
  ModalContent,
  Button,
  ConfirmButton,
} from "@dbsof/common/newui";

import {
  ErrorDetails,
  extractErrorDetails,
} from "../../utils/extractErrorDetails";

import {
  PrimitiveType,
  renderInvalidEditorValue,
} from "../../components/dataEditor/utils";

import {renderValue} from "@dbsof/inspector/buildScalar";
import inspectorStyles from "@dbsof/inspector/inspector.module.scss";

import CodeBlock from "@dbsof/common/ui/codeBlock";

import styles from "./editsModal.module.scss";

interface ReviewEditsModalProps {
  state: DataView;
}

export const ReviewEditsModal = observer(function ReviewEditsModal({
  state,
}: ReviewEditsModalProps) {
  const {openModal} = useModal();

  const [commiting, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<ErrorDetails | null>(null);

  const {params, statements} = state.edits.generateStatements();

  const closeModal = () => openModal(null, true);

  const hasErrors = statements.some((statement) => statement.error);

  return (
    <Modal
      title="Review changes"
      footerButtons={
        <Button
          kind="primary"
          loading={commiting}
          disabled={hasErrors}
          onClick={async () => {
            setCommitting(true);
            try {
              await state.edits.commitPendingEdits();
              state.edits.clearAllPendingEdits();
              state.refreshAllViews();
              closeModal();
            } catch (e: any) {
              setCommitError(extractErrorDetails(e));
            }
            setCommitting(false);
          }}
        >
          {commiting ? "Committing..." : "Commit changes"}
        </Button>
      }
      footerDetails={
        <ConfirmButton
          onClick={() => {
            state.edits.clearAllPendingEdits();
            closeModal();
          }}
        >
          Clear all changes
        </ConfirmButton>
      }
      onClose={closeModal}
      formError={
        commitError ? (
          <>
            <span className={styles.errorName}>{commitError.name}</span>:{" "}
            {commitError.msg}
            {commitError.details ? (
              <div className={styles.errorDetails}>
                Details: {commitError.details}
              </div>
            ) : null}
          </>
        ) : null
      }
    >
      <ModalContent className={styles.modalContent}>
        <div className={cn(styles.codeBlock, inspectorStyles.inspectorTheme)}>
          {statements.map(({varName, code, error}, i) => (
            <Fragment key={i}>
              <div className={styles.statementName}>{varName} :=</div>
              <CodeBlock
                code={code}
                customRanges={(tree) =>
                  getAllChildren(tree.topNode, "QueryParameter").map(
                    (node) => ({
                      range: [node.from, node.to],
                      renderer: (_, content) => {
                        const [paramCast, paramName] = code
                          .slice(node.from, node.to)
                          .split("$");
                        const param = params[paramName];

                        if (paramCast === "<_invalid>") {
                          return (
                            <span className={styles.codeBlockParamInvalid}>
                              {renderInvalidEditorValue(
                                param.value,
                                param.type as PrimitiveType
                              )}
                            </span>
                          );
                        }

                        content.props.children.pop();
                        return (
                          <span className={styles.codeBlockParam}>
                            {content}
                            <span className={styles.codeBlockParamValue}>
                              {renderParam(param)}
                            </span>
                          </span>
                        );
                      },
                    })
                  )
                }
              />
              <div className={styles.statementMessages}>
                {error ? (
                  <div className={styles.errorMessage}>
                    <WarningIcon />
                    {error}
                  </div>
                ) : null}
              </div>
            </Fragment>
          ))}
        </div>
        {/* <details>
          <summary>debug</summary>
          <pre>
            {JSON.stringify(
              state.edits,
              (key, val) => (typeof val === "bigint" ? val.toString() : val),
              2
            )}
          </pre>
        </details> */}
      </ModalContent>
    </Modal>
  );
});

function renderParam({
  type,
  value,
}: {
  type: SchemaType;
  value: any;
}): JSX.Element {
  if (type.schemaType === "Array") {
    return (
      <>
        [
        {(value as any[]).map((item, i) => (
          <>
            {i !== 0 ? ", " : null}
            {renderParam({type: type.elementType, value: item})}
          </>
        ))}
        ]
      </>
    );
  } else {
    return renderValue(
      value,
      type.name,
      type.schemaType === "Scalar" && !!type.enum_values,
      type.schemaType === "Range" || type.schemaType === "Multirange"
        ? type.elementType.name
        : undefined,
      false,
      undefined,
      undefined,
      50
    ).body;
  }
}
