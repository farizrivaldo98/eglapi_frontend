import Axios from "axios";
import { createSlice } from "@reduxjs/toolkit";

const BASE_URL = "http://10.163.0.66:8002";

export const userSlice = createSlice({
  name: "user",
  initialState: {
    user: {
      id_users: "",
      name: "",
      username: "",
      email: "",
      isAdmin: "",
    },
  },
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
    },
    logout: (state) => {
      state.user = {
        id_users: "",
        name: "",
        username: "",
        email: "",
        isAdmin: "",
      };
    },
  },
});

export const { setUser, logout } = userSlice.actions;
export default userSlice.reducer;

// ──────────────────────────────────────────────────────────────
// HELPER: kirim log aksi ke backend (bisa dipanggil dari mana saja)
// action : 'LOGOUT' | 'VIEW_UTILITY' | 'EXPORT_PDF'
// detail : object bebas, mis. { area, start, finish }
// ──────────────────────────────────────────────────────────────
export const logAuditAction = async (action, detail = {}) => {
  try {
    const token = localStorage.getItem("user_token");
    if (!token) return;
    await Axios.post(
      `${BASE_URL}/audit/log`,
      { action, detail },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    // Jangan biarkan kegagalan audit mengganggu UX
    console.error("Audit log gagal:", err);
  }
};

// ──────────────────────────────────────────────────────────────
// THUNK: logout dengan pencatatan audit LOGOUT terlebih dahulu
// Dipakai di Navbar sebagai pengganti logOut biasa.
// ──────────────────────────────────────────────────────────────
export function logoutWithAudit() {
  return async (dispatch) => {
    await logAuditAction("LOGOUT", {});          // catat LOGOUT
    dispatch(logout());                           // hapus state Redux
    localStorage.removeItem("user_token");        // hapus token
  };
}

// ──────────────────────────────────────────────────────────────
// Fungsi-fungsi yang sudah ada sebelumnya
// ──────────────────────────────────────────────────────────────
export function registerData(data) {
  return async (dispatch) => {
    let response = await Axios.post(`${BASE_URL}/part/register`, data);
    if (response) {
      alert(response.data.message);
    }
  };
}

export function loginData(data) {
  return async (dispatch) => {
    let respons = await Axios.post(`${BASE_URL}/part/login`, {
      username: data.username,
      password: data.password,
    });
    dispatch(setUser(respons.data.data));
    localStorage.setItem("user_token", respons.data.token);
    if (respons) {
      alert(respons.data.message);
    }
  };
}

export function CheckLogin(token) {
  return async (dispatch) => {
    let respons = await Axios.post(
      `${BASE_URL}/part/check-Login`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (respons) {
      dispatch(setUser(respons.data.data));
    }
  };
}