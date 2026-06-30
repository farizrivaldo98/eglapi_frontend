import { Navigate } from "react-router-dom";
import { Center, Spinner } from "@chakra-ui/react";

// ──────────────────────────────────────────────────────────────
// Guard buat <Route element={...}/>.
//
//   isLoggedIn : false → lempar balik ke "/"
//   ready      : data yang dipakai buat ngecek "allow" udah siap apa
//                belum (matrix page-access atau userGlobal.isAdmin).
//                Selama belum ready, nampilin spinner — biar gak
//                ke-redirect duluan sebelum data-nya kelar di-fetch.
//   allow      : boolean, hasil akhir boleh akses halaman ini apa nggak
//   children   : komponen halaman yang ditampilin kalau lolos semua cek
// ──────────────────────────────────────────────────────────────
export default function ProtectedRoute({ isLoggedIn, ready, allow, children }) {
  if (!isLoggedIn) return <Navigate to="/" replace />;

  if (!ready) {
    return (
      <Center py={20}>
        <Spinner thickness="4px" speed="0.65s" color="blue.500" size="xl" />
      </Center>
    );
  }

  if (!allow) return <Navigate to="/home" replace />;

  return children;
}