import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import AuthGuard from "./components/Auth/AuthGuard";
import LoginPage from "./components/Auth/LoginPage";
import Navbar from "./components/Navbar";
import FilePage from "./components/FilePage";
import ClipboardPage from "./components/ClipboardPage";
import BusySharePage from "./components/BusySharePage";
import ProfilePage from "./components/ProfilePage";
import Notification from "./components/Notification";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Notification />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <div className="min-h-screen bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
                <Navbar />
                <FilePage />
              </div>
            }
          />
          {/* /receive redirects to / — users use the Receive tab in FilePage */}
          <Route path="/receive" element={<Navigate to="/" replace />} />
          <Route
            path="/clipboard"
            element={
              <div className="min-h-screen bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
                <Navbar />
                <ClipboardPage />
              </div>
            }
          />
          <Route
            path="/busy-share"
            element={
              <div className="min-h-screen bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
                <Navbar />
                <BusySharePage />
              </div>
            }
          />
          <Route
            path="/profile"
            element={
              <AuthGuard>
                <div className="min-h-screen bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
                  <Navbar />
                  <ProfilePage />
                </div>
              </AuthGuard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
