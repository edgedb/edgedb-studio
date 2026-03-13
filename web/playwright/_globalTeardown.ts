import {ChildProcess} from "node:child_process";

function killProcess(proc: ChildProcess, signal?: number | NodeJS.Signals) {
  return new Promise<void>((resolve) => {
    proc.once("close", () => {
      resolve();
    });

    proc.kill(signal);
    proc.stdio.forEach((io) => io?.destroy());
  });
}

export default async function globalTeardown() {
  const uiServerProc: ChildProcess = globalThis.uiServerProc;

  const waits: Promise<void>[] = [];

  if (uiServerProc) {
    console.log("Closing UI server...");
    waits.push(
      killProcess(uiServerProc).then(() => console.log("...UI server closed"))
    );
  }

  const backendServerProc: ChildProcess = globalThis.backendServerProc;

  if (backendServerProc) {
    console.log("Closing backend server...");
    waits.push(
      killProcess(backendServerProc).then(() =>
        console.log("...Backend server closed")
      )
    );
  }

  await Promise.all(waits);
}
