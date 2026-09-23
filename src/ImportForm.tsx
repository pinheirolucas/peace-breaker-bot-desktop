import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { Button } from "./components/Button";
import { Dialog } from "./components/Dialog";
import { DropZone } from "./components/DropZone";
import type { DropState } from "./components/DropZone";
import { RadioGroup } from "./components/Radio";
import { Switch } from "./components/Switch";
import { mergeImported, sanitizeKeys } from "./lib/clipKeys";
import { useInstantsState } from "./storage";
import type { Instant } from "./storage";
import "./forms.css";

type Strategy = "" | "merge" | "replace";

interface Backup {
  instants?: Instant[];
}

export interface ImportFormProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Restores a backup written by Exportar. Only "instants" is ever read back —
 * which is also why a backup from before the token rebuild, whose "theme" key
 * still holds "light"/"dark", needs no migration: that key is never applied.
 */
export default function ImportForm({ open, onClose }: ImportFormProps) {
  const { t } = useTranslation();
  const readerRef = useRef<FileReader | null>(null);
  if (!readerRef.current) {
    readerRef.current = new FileReader();
  }

  const [importInstants, setImportInstants] = useState(false);
  const [strategy, setStrategy] = useState<Strategy>("");
  const [content, setContent] = useState<Backup | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const [instants, setInstants] = useInstantsState([]);

  const { acceptedFiles, fileRejections, getRootProps, getInputProps, isDragActive } =
    useDropzone({
      multiple: false,
      accept: { "application/json": [".json"] }
    });

  const clear = useCallback(() => {
    setImportInstants(false);
    setStrategy("");
    setContent(null);
    setError("");
    setFileName("");
  }, []);

  useEffect(() => {
    function handleLoad(event: ProgressEvent<FileReader>) {
      try {
        const parsed = JSON.parse(String(event.target?.result ?? ""));
        setContent(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        setError(t("import.rejectedContent"));
      }
    }

    const reader = readerRef.current!;
    reader.addEventListener("load", handleLoad);

    return () => {
      reader.removeEventListener("load", handleLoad);
      clear();
    };
  }, [open, clear, t]);

  // Acceptance and rejection are handled in one effect on purpose.
  // react-dropzone hands back a fresh `acceptedFiles` identity even when a
  // file was rejected and the array stays empty, so as two separate effects
  // the acceptance one runs second, calls clear(), and wipes the error the
  // rejection just set.
  useEffect(() => {
    clear();

    if (fileRejections.length) {
      setError(t("import.rejectedType"));
      return;
    }

    const [file] = acceptedFiles;
    if (file) {
      setFileName(file.name);
      readerRef.current!.readAsText(file, "utf-8");
    }
  }, [acceptedFiles, fileRejections, clear, t]);

  const incoming = content?.instants ?? [];
  // The options appear only once the file is actually parsed, so there is
  // never a moment where Importar is offered against content not yet read.
  const parsed = Boolean(fileName) && !error && content !== null;
  const canImport = parsed && importInstants && strategy !== "";

  function handleImport() {
    if (!canImport) {
      return;
    }

    if (strategy === "replace") {
      // The file's keys come with it, minus any that repeat.
      setInstants(sanitizeKeys(incoming));
    } else {
      // Keep what is stored; add only urls not already there, so a stored
      // name (and key) wins over an incoming one for the same clip. An
      // imported key that collides with a stored one is dropped.
      setInstants(mergeImported(instants, incoming));
    }

    onClose();
  }

  let dropState: DropState = "idle";
  let title = "";
  let hint: string | undefined;

  if (error) {
    dropState = "bad";
    title = t("import.badFileTitle");
    hint = error;
  } else if (fileName) {
    dropState = "ok";
    title = fileName;
    hint = content ? t("import.count", { count: incoming.length }) : t("import.readingFile");
  } else if (isDragActive) {
    dropState = "over";
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("import.dialogTitle")}
      description={t("import.dialogDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleImport} disabled={!canImport}>
            {t("app.import")}
          </Button>
        </>
      }
    >
      <div {...getRootProps({ className: "drop-root" })}>
        <input {...getInputProps()} />
        <DropZone state={dropState} title={title} hint={hint} />
      </div>

      {parsed && (
        <div className="opts">
          <p className="q">{t("import.whatToImport")}</p>
          <Switch label="Instants" checked={importInstants} onCheckedChange={setImportInstants} />
          {importInstants && (
            <>
              <p className="q">{t("import.whatAboutExisting")}</p>
              <RadioGroup<Strategy>
                aria-label={t("import.whatAboutExisting")}
                value={strategy}
                onChange={setStrategy}
                options={[
                  { value: "merge", label: t("import.keepMine") },
                  { value: "replace", label: t("import.replaceAll") }
                ]}
              />
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
