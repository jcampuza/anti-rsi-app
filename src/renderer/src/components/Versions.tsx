export function Versions(): React.JSX.Element {
  const versions = window.electron.process.versions

  return (
    <ul className="flex justify-center gap-4 text-xs text-text-tertiary">
      <li className="list-none">Electron v{versions.electron}</li>
      <li className="list-none">Chromium v{versions.chrome}</li>
      <li className="list-none">Node v{versions.node}</li>
    </ul>
  )
}
