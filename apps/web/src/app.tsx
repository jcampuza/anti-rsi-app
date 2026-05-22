import "./assets/tailwind.css"
import { Router, Route } from "@solidjs/router"
import { AntiRsiProvider } from "~/context/antirsi"
import ConfigPage from "~/pages/config"
import HomePage from "~/pages/home"
import MicroBreakPage from "~/pages/micro-break"
import WorkBreakPage from "~/pages/work-break"

export function App() {
  return (
    <AntiRsiProvider>
      <Router>
        <Route path="/" component={HomePage} />
        <Route path="/config" component={ConfigPage} />
        <Route path="/micro-break" component={MicroBreakPage} />
        <Route path="/work-break" component={WorkBreakPage} />
      </Router>
    </AntiRsiProvider>
  )
}
