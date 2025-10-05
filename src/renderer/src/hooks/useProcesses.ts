import { useProcessesStore } from '@renderer/stores/processes'

export const useProcesses = (): string[] => {
  const processes = useProcessesStore((s) => s.processes)

  return processes
}

export default useProcesses
