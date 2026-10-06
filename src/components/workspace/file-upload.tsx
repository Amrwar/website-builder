"use client";

import { useRef, useState } from "react";

import { upload } from "@vercel/blob/client";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Progress } from "@/components/ui/progress";
import { recordUploadedFile } from "@/server/workspace-actions";

const MAX_MB = 25;

/**
 * Uploading project files.
 *
 * The file goes straight from the browser to blob storage, so a 20 MB brand
 * pack is not squeezed through a function request body capped at 4.5 MB. The
 * route that issues the token checks participation first and scopes the token
 * to one pathname under this project.
 *
 * Once the upload resolves, a server action records the row -- and re-verifies
 * the blob independently, so nothing here is trusted beyond "please look at
 * what I just wrote".
 */
export function FileUpload({
  projectId,
  reference,
}: {
  projectId: string;
  reference: string;
}) {
  const t = useTranslations("workspace");
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function send(files: FileList) {
    setError(null);
    setBusy(true);

    try {
      for (const [index, file] of Array.from(files).entries()) {
        if (file.size > MAX_MB * 1024 * 1024) {
          setError(t("files.tooLarge", { limit: MAX_MB }));
          continue;
        }

        const blob = await upload(`projects/${projectId}/${file.name}`, file, {
          access: "public",
          handleUploadUrl: `/api/projects/${reference}/files/upload`,
          contentType: file.type || "application/octet-stream",
        });

        const result = await recordUploadedFile(
          projectId,
          reference,
          blob.pathname,
          file.name,
          file.type || "application/octet-stream",
        );

        if (!result.ok) {
          setError(result.message);
          break;
        }

        setProgress(Math.round(((index + 1) / files.length) * 100));
      }
    } catch {
      setError(t("files.uploadError"));
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Callout tone="danger" live title={error} /> : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          if (event.target.files?.length) void send(event.target.files);
        }}
      />

      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        loading={busy}
        loadingLabel={t("files.uploading")}
        startIcon={<Upload className="size-4" />}
        onClick={() => inputRef.current?.click()}
        className="self-start"
      >
        {t("files.upload")}
      </Button>

      {busy ? <Progress value={progress} label={t("files.uploading")} /> : null}
    </div>
  );
}
