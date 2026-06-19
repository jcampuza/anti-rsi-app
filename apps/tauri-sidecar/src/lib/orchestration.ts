import type { ApiServerHandle } from "@antirsi/server";
import type { AntiRsiEngine } from "./antirsi-engine";
import { saveConfig } from "./config-store";
import { startWatchedProcessPolling } from "./process-service";

type SidecarOrchestrationDeps = {
  antiRsiEngine: AntiRsiEngine;
  apiServer: ApiServerHandle;
  userDataDir: string;
};

export const startSidecarOrchestration = ({
  antiRsiEngine,
  apiServer,
  userDataDir,
}: SidecarOrchestrationDeps): void => {
  let lastStatusBroadcastAt = 0;

  antiRsiEngine.onConfigChange(({ config }) => {
    apiServer.broadcast({ type: "config-changed", config });
    void saveConfig(userDataDir, config);
  });

  antiRsiEngine.onEvent(({ event, snapshot }) => {
    if (event.type === "paused") {
      apiServer.broadcast({ type: "timers-paused", snapshot });
      return;
    }
    if (event.type === "resumed") {
      apiServer.broadcast({ type: "timers-resumed", snapshot });
      return;
    }

    const now = Date.now();
    if (event.type === "status-update") {
      if (now - lastStatusBroadcastAt < 5000) {
        return;
      }
      lastStatusBroadcastAt = now;
    } else if (event.type === "timings-reset") {
      lastStatusBroadcastAt = now;
    }

    apiServer.broadcast({ type: "antirsi", event, snapshot });
  });

  startWatchedProcessPolling({
    onProcessesChanged: (processes) => {
      antiRsiEngine.setProcesses(processes);
      if (processes.length > 0) {
        antiRsiEngine.addInhibitor("process:zoom");
      } else {
        antiRsiEngine.removeInhibitor("process:zoom");
      }
      apiServer.broadcast({ type: "processes-updated", list: processes });
    },
  });
};
