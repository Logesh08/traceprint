import { Route, Routes } from "react-router-dom";
import { CapturePage } from "./pages/CapturePage";
import { LandingPage } from "./pages/LandingPage";
import { SessionPage } from "./pages/SessionPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/session/:id" element={<SessionPage />} />
      <Route path="/capture/:id/:side" element={<CapturePage />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
