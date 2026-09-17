import { useEffect } from "react";
import { useStore } from "./store";
import { Toolbar } from "./views/Toolbar";
import { MainArea } from "./views/MainArea";
import { Inspector } from "./views/Inspector";
import { RejectionBanner } from "./views/RejectionBanner";
import { ensureVideoProgressSubscribed } from "./exporter";
import "./global.css";
import "./App.css";

export default function App() {
  const theme = useStore(s => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    ensureVideoProgressSubscribed();
  }, []);

  return (
    <div className="app-root">
      <Toolbar />
      <RejectionBanner />
      <div className="app-body">
        <MainArea />
        <Inspector />
      </div>
    </div>
  );
}
