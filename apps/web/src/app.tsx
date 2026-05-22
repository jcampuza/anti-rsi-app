import "./assets/tailwind.css"
import { Router, Route } from "@solidjs/router"
import { Settings } from "lucide-solid"
import { createSignal, onCleanup, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { ConfigPanel } from "~/components/ConfigPanel"
import { buttonVariants } from "~/components/ui/Button"
import { AntiRsiProvider, useAntiRsi } from "~/context/antirsi"
import HomePage from "~/pages/home"
import MicroBreakPage from "~/pages/micro-break"
import WorkBreakPage from "~/pages/work-break"

const Header = () => {
  const [isSettingsOpen, setIsSettingsOpen] = createSignal(false);

  const toggleSettings = () => {
    setIsSettingsOpen(s => !s)
  }

  const antirsi = useAntiRsi()

  const handleKeyDown = (e: KeyboardEvent) => {
    // Close settings on escape
    if (e.key === 'Escape') {
      setIsSettingsOpen(false)
    }

    // Open settings on comma + meta key - similar to other apps
    if (e.key === ',' && e.metaKey) {
      setIsSettingsOpen(true)
    }
  }

  document.body.addEventListener('keydown', handleKeyDown)

  onCleanup(() => {
    document.body.removeEventListener('keydown', handleKeyDown)
  })


  return (
    <header class="app-region-no-drag flex items-center justify-end gap-6 text-foreground">
      <button class={buttonVariants({ variant: "link" })} onClick={toggleSettings}>
        <Settings class="h-5 w-5" />
      </button>

      <Portal>
        <Show when={isSettingsOpen()}>
          <div class="absolute inset-0 flex items-center justify-center">
            <ConfigPanel class="z-10" config={antirsi.config()!} api={antirsi.api} onReset={() => { }} />
            <div class="absolute inset-0 bg-background/85" onClick={() => setIsSettingsOpen(false)}></div>

          </div>



        </Show>
      </Portal>
    </header >
  )
}



export function App() {
  return (
    <AntiRsiProvider>

      <Router root={(props) => {
        return <div >
          <Header />
          {props.children}
        </div>
      }}>
        {/* <Header /> */}
        <Route path="/" component={HomePage} />
        <Route path="/micro-break" component={MicroBreakPage} />
        <Route path="/work-break" component={WorkBreakPage} />
      </Router>

    </AntiRsiProvider>
  )
}
