import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Maintenance from "./pages/Maintenance";
import Pareto from "./pages/ParetoData";
import CreateNew from "./pages/CreateNew";
import CreateEdit from "./pages/CreateEdit";
import AppPareto from "./pages/Chiller";
import ScadaMonitor from "./pages/Scadamonitor";
import Login from "./pages/Login";
import Register from "./pages/Register";
import HomePage from "./pages/Homepage"; // ← BARU
import { CheckLogin } from "./features/part/userSlice";
import { useDispatch, useSelector } from "react-redux";
import { useEffect, useState } from "react"; // ← DIUBAH: tambah useState
import CheckMail from "./pages/CheckMail";
import EditProfile from "./pages/EditProfile";
import Production from "./pages/Production";
import Utility from "./pages/Utility";
import AuditTrail from "./pages/AuditTrail";
import Administrator from "./pages/Administrator";
import ProtectedRoute from "./components/ProtectedRoute"; // ← BARU
import axios from "axios"; // ← BARU

const API = "http://10.163.0.66:8002"; // ← BARU, samain kaya di PageManagement.jsx

// ← BARU: key di sini HARUS sama persis kaya key "PAGES" di PageManagement.jsx
const LEVEL_PAGE = {
  maintenance: "Maintenance",
  production: "Production",
  utility: "Utility",
  Chiller: "Chiller",
};

function App() {
  const dispatch = useDispatch();
  const userGlobal = useSelector((state) => state.user.user);
  const userlocalStorage = localStorage.getItem("user_token");
  const isLoggedIn = !!(userGlobal.id || userGlobal.id_users); // ← BARU, dipakai di 3 tempat di bawah
  const isAdmin = Number(userGlobal.isAdmin) === 1; // ← BARU, khusus /administrator & /audit-trail

  // ← BARU: GANTI "level" sesuai nama field level asli di userSlice kamu kalau beda
  const userLevel = userGlobal.level;

  // ← BARU: matrix dari GET /part/page-access, contoh: { "1": ["Maintenance","Utility"], ... }
  const [pageAccess, setPageAccess] = useState({});
  const [pageAccessReady, setPageAccessReady] = useState(false);

  const keepLogin = () => {
    if (userlocalStorage) {
      dispatch(CheckLogin(userlocalStorage));
    }
  };

  // ← BARU
  const fetchPageAccess = async () => {
    setPageAccessReady(false);
    try {
      const token = localStorage.getItem("user_token");
      const res = await axios.get(`${API}/part/page-access`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPageAccess(res.data || {});
    } catch (err) {
      // gagal fetch → fail-safe: anggap gaada akses sama sekali (bukan fail-open)
      setPageAccess({});
    } finally {
      setPageAccessReady(true);
    }
  };

  useEffect(() => {
    keepLogin();
  }, []);

  // ← BARU: refetch tiap kali status login berubah (login / logout / ganti user)
  useEffect(() => {
    if (isLoggedIn) {
      fetchPageAccess();
    } else {
      setPageAccess({});
      setPageAccessReady(true);
    }
  }, [isLoggedIn]);

  // ← BARU
  const canAccess = (pageKey) => (pageAccess[userLevel] || []).includes(pageKey);

  return (
    <div>
      {isLoggedIn && <Navbar />}
      <Routes>
        {/* ← DIUBAH: kalau udah login, "/" gak lagi nampilin Login, langsung lempar ke /home */}
        <Route
          path="/"
          element={isLoggedIn ? <Navigate to="/home" replace /> : <Login />}
        />
        {/* ← BARU: halaman home, hanya bisa diakses kalau sudah login */}
        <Route
          path="/home"
          element={isLoggedIn ? <HomePage /> : <Navigate to="/" replace />}
        />
        <Route path="/register" element={<Register />} />
        <Route path="/Scadamonitor" element={<ScadaMonitor/>} />

        {/* ← DIUBAH: 4 halaman ini sekarang ngikutin matrix Page Management di DB */}
        <Route
          path="/maintenance"
          element={
            <ProtectedRoute
              isLoggedIn={isLoggedIn}
              ready={pageAccessReady}
              allow={canAccess(LEVEL_PAGE.maintenance)}
            >
              <Maintenance />
            </ProtectedRoute>
          }
        />
        <Route path="/pareto" element={<Pareto />} />
        <Route path="/createnew" element={<CreateNew />} />
        <Route path="/createedite/:id" element={<CreateEdit />} />
        <Route
          path="/Chiller"
          element={
            <ProtectedRoute
              isLoggedIn={isLoggedIn}
              ready={pageAccessReady}
              allow={canAccess(LEVEL_PAGE.Chiller)}
            >
              <AppPareto />
            </ProtectedRoute>
          }
        />
        <Route path="/mail" element={<CheckMail />} />
        <Route path="/editprofile" element={<EditProfile />} />
        <Route
          path="/production"
          element={
            <ProtectedRoute
              isLoggedIn={isLoggedIn}
              ready={pageAccessReady}
              allow={canAccess(LEVEL_PAGE.production)}
            >
              <Production />
            </ProtectedRoute>
          }
        />
        <Route
          path="/Utility"
          element={
            <ProtectedRoute
              isLoggedIn={isLoggedIn}
              ready={pageAccessReady}
              allow={canAccess(LEVEL_PAGE.utility)}
            >
              <Utility />
            </ProtectedRoute>
          }
        />

        {/* ← DIUBAH: dua halaman ini TETEP pake userGlobal.isAdmin, gak ikut matrix level */}
        <Route
          path="/audit-trail"
          element={
            <ProtectedRoute isLoggedIn={isLoggedIn} ready={true} allow={isAdmin}>
              <AuditTrail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/administrator"
          element={
            <ProtectedRoute isLoggedIn={isLoggedIn} ready={true} allow={isAdmin}>
              <Administrator />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}

export default App;