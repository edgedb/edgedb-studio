import {FormEvent, useEffect, useMemo, useRef, useState} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";
import {TextInput, Select, SubmitButton} from "@dbsof/common/newui";

import {DatabaseTabSpec} from "../../components/databasePage";
import {TabQueryStats} from "../../icons";
import {useDatabaseState} from "../../state";

import styles from "./perfStats.module.scss";

type ImportJobStatus = "running" | "completed" | "failed";

type ImportJob = {
  id: string;
  name: string;
  source: string;
  status: ImportJobStatus;
  progress: number;
  createdAt: string;
  completedAt?: string | null;
  files?: {filename: string; size: number}[];
  rows?: number;
};

const ImportPage = observer(function ImportPage() {
  const dbState = useDatabaseState();
  const instance = dbState ? dbState : null;
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [name, setName] = useState("");
  const [source, setSource] = useState("CSV upload");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const lastJobsKey = useRef<string>("");

  const apiBase = useMemo(() => {
    const instanceId = (instance as any)?.instanceId ?? "default";
    const serverUrl = (instance as any)?.serverUrl ?? "http://localhost:5757";
    return `${serverUrl}/instances/${encodeURIComponent(
      instanceId
    )}/databases/${encodeURIComponent(dbState.name)}/imports`;
  }, [dbState.name, instance]);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await fetch(apiBase);
        if (!res.ok) return;
        const data: ImportJob[] = await res.json();
        const key = data
          .map((j) => `${j.id}:${j.updatedAt ?? j.completedAt ?? j.progress}`)
          .sort()
          .join("|");
        if (key !== lastJobsKey.current) {
          lastJobsKey.current = key;
          setJobs(data);
        }
      } catch (err) {
        console.error("Failed to fetch imports", err);
      }
    };
    fetchJobs();
    const timer = window.setInterval(fetchJobs, 2000);
    return () => window.clearInterval(timer);
  }, [apiBase]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("source", source);
    formData.append("notes", notes);
    files.forEach((f) => formData.append("files", f));
    fetch(apiBase, {
      method: "POST",
      body: formData,
    })
      .then(() => {})
      .catch((err) => console.error("Failed to start import", err));
    setName("");
    setNotes("");
    setFiles([]);
  };

  const runningJobs = useMemo(
    () => jobs.filter((j) => j.status === "running"),
    [jobs]
  );

  return (
    <div className={styles.importPage}>
      <div className={styles.split}>
        <div className={styles.leftPane}>
          <h2>Import</h2>
          <p className={styles.subtitle}>Upload.</p>
          <form className={styles.form} onSubmit={handleSubmit}>
            <TextInput
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer metering snapshot"
              required
            />
            <Select
              label="Source"
              selectedItemId={source}
              items={[
                {id: "CSV upload", label: "CSV"},
                {id: "JSON upload", label: "JSON"},
                {id: "API pull", label: "API"},
                {id: "Database sync", label: "Sync"},
              ]}
              onChange={(item) => setSource(item.id as string)}
            />
            <label className={styles.dropzone}>
              <input
                type="file"
                multiple
                accept=".csv,text/csv"
                onChange={(e) => setFiles(e.target.files ? [...e.target.files] : [])}
              />
              <div className={styles.dropzoneContent}>
                <div className={styles.dropHeadline}>
                  <strong>Files</strong>
                  <span className={styles.helper}>Drop / browse</span>
                </div>
              </div>
            </label>
            {files.length ? (
              <div className={styles.fileList}>
                {files.map((f) => (
                  <div key={`${f.name}-${f.lastModified}`} className={styles.fileMeta}>
                    <span>{f.name}</span>
                    <span>{(f.size / 1024).toFixed(1)} KB</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.filePlaceholder}>No files</div>
            )}
            <TextInput
              type="textarea"
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add context, expected columns, or schedule."
              className={styles.notes}
            />
            <SubmitButton kind="primary">Run</SubmitButton>
          </form>

          {runningJobs.length ? (
            <div className={styles.inlineStatus}>
              <div className={styles.badge}>{runningJobs.length} running</div>
              <div className={styles.progressList}>
                {runningJobs.map((job) => (
                  <div key={job.id} className={styles.progressRow}>
                    <span>{job.name}</span>
                    <div className={styles.progressBar}>
                      <div style={{width: `${job.progress}%`}} />
                    </div>
                    <span className={styles.progressPct}>
                      {job.progress.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.rightPane}>
          <div className={styles.listHeader}>
            <div>
              <h3>Imports</h3>
              <p>History</p>
            </div>
            <div className={styles.badge}>{jobs.length}</div>
          </div>
          <div className={styles.jobList}>
            {jobs.map((job) => (
              <div key={job.id} className={styles.jobCard}>
                <div className={styles.jobTop}>
                  <div>
                    <div className={styles.jobTitle}>{job.name}</div>
                    <div className={styles.jobMeta}>
                      <span>{job.source}</span>
                      <span>•</span>
                      <span>
                        {job.rows ? `${job.rows.toLocaleString()} rows` : ""}
                        {job.completedAt
                          ? ` • done ${new Date(job.completedAt).toLocaleTimeString()}`
                          : ""}
                      </span>
                    </div>
                    {job.files?.length ? (
                      <div className={styles.fileList}>
                        {job.files.map((f, i) => (
                          <div key={`${job.id}-file-${i}`} className={styles.fileMeta}>
                            <span>{f.filename}</span>
                            <span>{(f.size / 1024).toFixed(1)} KB</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      styles.status,
                      styles[`status_${job.status}`]
                    )}
                  >
                    {job.status}
                  </div>
                </div>
                <div className={styles.progressBar}>
                  <div style={{width: `${job.progress}%`}} />
                </div>
              </div>
            ))}
            {!jobs.length ? (
              <div className={styles.empty}>No imports yet.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});

export const perfStatsTabSpec: DatabaseTabSpec = {
  path: "import",
  label: "Import",
  icon: (active) => <TabQueryStats active={active} />,
  usesSessionState: false,
  element: <ImportPage />,
};
