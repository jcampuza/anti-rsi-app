import { Route, Router } from "@solidjs/router";
import { Header } from "~/components/Header";
import { AntiRsiProvider } from "~/context/antirsi";
import HomePage from "~/pages/home";
import MicroBreakPage from "~/pages/micro-break";
import WorkBreakPage from "~/pages/work-break";
import "./assets/tailwind.css";

export function App() {
  return (
    <AntiRsiProvider>
      <Router
        root={(props) => {
          return (
            <div>
              <Header />
              {props.children}
            </div>
          );
        }}
      >
        {/* <Header /> */}
        <Route path="/" component={HomePage} />
        <Route path="/micro-break" component={MicroBreakPage} />
        <Route path="/work-break" component={WorkBreakPage} />
      </Router>
    </AntiRsiProvider>
  );
}
