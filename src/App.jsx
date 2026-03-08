import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import AuthGuard from "./components/Auth/AuthGuard";
import LoginPage from "./components/Auth/LoginPage";
import Navbar from "./components/Navbar";
import SenderPage from "./components/SenderPage";
import ReceiverPage from "./components/ReceiverPage";
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
              <AuthGuard>
                {/* BUG FIX: removed hardcoded bg-slate-950 wrapper — let pages control their own bg */}
                <div className="min-h-screen bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
                  <Navbar />
                  <SenderPage />
                </div>
              </AuthGuard>
            }
          />
          <Route
            path="/receive"
            element={
              <div className="min-h-screen bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
                <Navbar />
                <ReceiverPage />
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
