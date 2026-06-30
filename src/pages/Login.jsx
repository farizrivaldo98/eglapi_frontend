import React from "react";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { loginData } from "../features/part/userSlice";

function Login() {
  const dispatch = useDispatch();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const usernameHandler = (event) => {
    setUsername(event.target.value.toUpperCase());
  };

  const passwordHandler = (event) => {
    setPassword(event.target.value);
  };

  const addLogin = () => {
    let tempData = {
      username: username,
      password: password,
    };
    dispatch(loginData(tempData));
    // Redirect ke /home udah otomatis ditangani App.js begitu Redux
    // userGlobal terisi — gak perlu navigate(0)/setTimeout lagi.
  };

  // ← BARU: Enter di field Initial/Password = sama kayak klik tombol Sign in,
  // cuma jalan kalau dua field udah keisi (sama kayak kondisi disabled tombol).
  const handleKeyDown = (event) => {
    if (event.key === "Enter" && username && password) {
      addLogin();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-2xl shadow-lg px-10 py-12 w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="https://www.lapilaboratories.com/assets/images/logo%20lapi2-01.png"
            alt="Lapi Laboratories"
            className="h-14 w-auto mb-4"
          />
          <h2 className="text-2xl font-bold text-gray-800 tracking-tight">
            Sign in
          </h2>
          <p className="text-sm text-gray-400 mt-1">PT. Lapi Laboratories</p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
              Initial
            </label>
            <input
              onChange={usernameHandler}
              onKeyDown={handleKeyDown}
              value={username}
              id="username"
              name="username"
              type="text"
              autoComplete="off"
              maxLength={3}
              required
              style={{ textTransform: "uppercase" }}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              placeholder="Contoh: ABC"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
              Password
            </label>
            <input
              onChange={passwordHandler}
              onKeyDown={handleKeyDown}
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              placeholder="Password"
            />
          </div>

          {/* Remember me + Register */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              Remember me
            </label>
            <a
              href="register"
              className="text-sm font-medium text-green-600 hover:text-green-500 transition"
            >
              Register
            </a>
          </div>

          {/* Button */}
          <button
            onClick={() => addLogin()}
            type="button"
            disabled={!username || !password}
            className="w-full mt-2 py-2.5 rounded-lg text-sm font-semibold tracking-wide transition
              bg-green-600 hover:bg-green-500 active:bg-green-700 text-white
              disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;