import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Maintenance from "./pages/Maintenance";
import Pareto from "./pages/ParetoData";
import CreateNew from "./pages/CreateNew";
import CreateEdit from "./pages/CreateEdit";
import AppPareto from "./pages/building";
import Login from "./pages/Login";
import Register from "./pages/Register";
import HomePage from "./pages/HomePage"; // ← BARU
import { CheckLogin } from "./features/part/userSlice";
import { useDispatch, useSelector } from "react-redux";
import { useEffect } from "react";
import CheckMail from "./pages/CheckMail";
import EditProfile from "./pages/EditProfile";
import Production from "./pages/Production";
import Utility from "./pages/Utility";
import AuditTrail from "./pages/AuditTrail";
import Administrator from "./pages/Administrator";

function App() {
  const dispatch = useDispatch();
  const userGlobal = useSelector((state) => state.user.user);
  const userlocalStorage = localStorage.getItem("user_token");
  const isLoggedIn = !!(userGlobal.id || userGlobal.id_users); // ← BARU, dipakai di 3 tempat di bawah

  const keepLogin = () => {
    if (userlocalStorage) {
      dispatch(CheckLogin(userlocalStorage));
    }
  };

  useEffect(() => {
    keepLogin();
  }, []);

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
        <Route path="/register"        element={<Register />} />
        <Route path="/maintenance"     element={<Maintenance />} />
        <Route path="/pareto"          element={<Pareto />} />
        <Route path="/createnew"       element={<CreateNew />} />
        <Route path="/createedite/:id" element={<CreateEdit />} />
        <Route path="/building"        element={<AppPareto />} />
        <Route path="/mail"            element={<CheckMail />} />
        <Route path="/editprofile"     element={<EditProfile />} />
        <Route path="/production"      element={<Production />} />
        <Route path="/Utility"         element={<Utility />} />
        <Route path="/audit-trail"     element={<AuditTrail />} />
        <Route path="/administrator"   element={<Administrator />} />
      </Routes>
    </div>
  );
}

export default App;