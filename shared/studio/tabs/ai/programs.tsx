import {useEffect, useMemo, useState} from "react";
import {observer} from "mobx-react-lite";

import {Button, TextInput} from "@dbsof/common/newui";
import SplitView from "@dbsof/common/ui/splitView";
import {SplitViewState} from "@dbsof/common/ui/splitView/model";
import {
  NodeGraph,
  NodeGraphMinimap,
  Schema,
  schemaContext,
  useDebugState,
  type SchemaObject,
} from "@dbsof/node-graph";
import {DebugControls} from "@dbsof/node-graph/components/schemaGraph/debug";
import {useRef} from "react";

import {useDatabaseState} from "../../state";
import {instanceCtx} from "../../state/instance";

import styles from "./aiPrograms.module.scss";

type ProgramNode = {id: string; label: string; status: string};
type ProgramEdge = {from: string; to: string; label?: string};
type ProgramGraph = {nodes: ProgramNode[]; edges: ProgramEdge[]};

type Program = {
  id: string;
  feature: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  graph: ProgramGraph;
};

type TaskWithProgram = {
  task: {id: string; status: string; programId: string};
  program: Program;
};

const AIPrograms = observer(function AIPrograms() {
  const db = useDatabaseState();
  const instance = instanceCtx.get(db)!;

  const [feature, setFeature] = useState("");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  const serverUrl = instance.serverUrl;
  const instanceId = instance.instanceId ?? "default";
  const splitState = useMemo(
    () => new SplitViewState({sizes: [35, 65]}),
    []
  );
  const lastProgramsKey = useRef<string>("");
  const lastGraphKey = useRef<string>("");

  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === selectedProgramId) ?? programs[0],
    [programs, selectedProgramId]
  );
  const graphState = useMemo(
    () => Schema.create({graph: {viewport: {}}}),
    []
  );
  useEffect(() => {
    graphState.graph.setDebugShowAllLinks(true);
  }, [graphState]);
  const debugState = useDebugState();

  const loadPrograms = async () => {
    try {
      const res = await fetch(
        `${serverUrl}/instances/${encodeURIComponent(
          instanceId
        )}/databases/${encodeURIComponent(db.name)}/ai/programs`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        const key = data
          .map((p: Program) => `${p.id}:${p.updatedAt}`)
          .sort()
          .join("|");
        if (key !== lastProgramsKey.current) {
          lastProgramsKey.current = key;
          setPrograms(data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch programs", err);
    }
  };

  useEffect(() => {
    loadPrograms();
    const id = window.setInterval(loadPrograms, 2000);
    return () => window.clearInterval(id);
  }, [serverUrl, instanceId, db.name]);

  useEffect(() => {
    const objects: SchemaObject[] = [];
    const program = selectedProgram;
    const graphKey = program ? `${program.id}:${program.updatedAt}` : "none";
    if (graphKey === lastGraphKey.current) {
      return;
    }
    lastGraphKey.current = graphKey;

    if (program?.graph) {
      const nodes = program.graph.nodes ?? [];
      const edges = program.graph.edges ?? [];
      const nameById = new Map(
        nodes.map((node) => [node.id, node.label || node.id])
      );
      for (const node of nodes) {
        const name = nameById.get(node.id)!;
        const outgoing = edges.filter((e) => e.from === node.id);
        objects.push({
          name,
          annotations: [
            {
              name: "@style::bgcolor",
              "@value": node.status === "done" ? "#1b5e20" : node.status === "in-progress" ? "#0d47a1" : "#263238",
            },
          ],
          is_abstract: false,
          from_alias: false,
          expr: null,
          inherits_from: [],
          inherited_by: [],
          constraints: [],
          annotations: [],
          properties: [],
          links: outgoing.map((edge, idx) => ({
            name: edge.label || `step_${idx}`,
            targetNames: [nameById.get(edge.to) ?? edge.to],
            required: true,
            readonly: true,
            cardinality: "One",
            expr: null,
            default: "",
            constraints: [],
            annotations: [],
            properties: [],
          })),
        });
      }
    }
    graphState.updateSchema(objects, [], [], []);
  }, [selectedProgram, graphState]);

  const submitProgram = async () => {
    if (!feature.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${serverUrl}/instances/${encodeURIComponent(
          instanceId
        )}/databases/${encodeURIComponent(db.name)}/ai/programs`,
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({feature}),
        }
      );
      if (res.ok) {
        const data: TaskWithProgram = await res.json();
        setPrograms((prev) => {
          const next = [data.program, ...prev.filter((p) => p.id !== data.program.id)];
          return next;
        });
        setSelectedProgramId(data.program.id);
        setFeature("");
      }
    } catch (err) {
      console.error("Failed to create program", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <SplitView
        className={styles.split}
        state={splitState}
        minViewSize={25}
        views={[
          <div className={`${styles.pane} ${styles.leftPane}`} key="left">
            <div className={styles.promptBox}>
              <div className={styles.promptHeader}>
                <div>
                  <h3>Feature</h3>
                  <p>State the capability to build.</p>
                </div>
                <div className={styles.actions}>
                  <Button
                    kind="primary"
                    onClick={submitProgram}
                    disabled={submitting || !feature.trim()}
                    loading={submitting}
                  >
                    Build
                  </Button>
                  <Button
                    kind="secondary"
                    onClick={() => {
                      if (!selectedProgram) return;
                      // simulate running the graph
                      setPrograms((prev) =>
                        prev.map((p) =>
                          p.id === selectedProgram.id
                            ? {
                                ...p,
                                status: "ready",
                                updatedAt: new Date().toISOString(),
                                graph: {
                                  ...p.graph,
                                  nodes: p.graph.nodes.map((n) => ({
                                    ...n,
                                    status: "done",
                                  })),
                                },
                              }
                            : p
                        )
                      );
                    }}
                    disabled={!selectedProgram}
                  >
                    Run
                  </Button>
                </div>
              </div>
              <TextInput
                type="textarea"
                label=""
                value={feature}
                onChange={(e) => setFeature(e.target.value)}
                placeholder="Describe the feature to build"
                className={styles.textarea}
              />
            </div>

            <div className={styles.programList}>
              <div className={styles.listHeader}>
                <h4>Programs</h4>
                <span className={styles.badge}>{programs.length}</span>
              </div>
              {programs.length === 0 ? (
                <div className={styles.empty}>No programs yet. Add a feature to start.</div>
              ) : (
                programs.map((program) => (
                  <div
                    key={program.id}
                    className={`${styles.programCard} ${
                      selectedProgram?.id === program.id ? styles.active : ""
                    }`}
                    onClick={() => setSelectedProgramId(program.id)}
                  >
                    <div className={styles.programTitle}>
                      {(program.feature || "Untitled").length > 38
                        ? `${(program.feature || "Untitled").slice(0, 38)}...`
                        : program.feature || "Untitled"}
                    </div>
                    <div className={styles.programMeta}>
                      <span className={styles.pill}>{program.status}</span>
                      <span>{new Date(program.updatedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>,
          <div className={styles.pane} key="right">
            <div className={styles.graphArea}>
              {selectedProgram?.status === "building" ? (
                <div className={styles.loaderOverlay}>
                  <div className={styles.spinner} />
                  <div className={styles.loaderText}>Building…</div>
                </div>
              ) : null}
              <schemaContext.Provider value={graphState}>
                <DebugControls debugState={debugState} schemaState={graphState} />
                <NodeGraphMinimap className={styles.minimap} />
                <NodeGraph className={styles.graph} debug={debugState[0]} />
              </schemaContext.Provider>
            </div>
          </div>,
        ]}
      />
    </div>
  );
});

export default AIPrograms;
