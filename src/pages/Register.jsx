import React from "react";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import { registerData } from "../features/part/userSlice";

function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const fullNameHandler = (event) => setFullName(event.target.value);
  const userNameHandler = (event) => setUserName(event.target.value.toUpperCase());
  const emailHandler = (event) => setEmail(event.target.value);
  const passwordHandler = (event) => setPassword(event.target.value);

  const addRegister = () => {
    let tempData = {
      email: email,
      name: fullName,
      username: userName,
      password: password,
    };
    dispatch(registerData(tempData));
    navigate("/");
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
            Register
          </h2>
          <p className="text-sm text-gray-400 mt-1">PT. Lapi Laboratories</p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
              Full Name
            </label>
            <input
              onChange={fullNameHandler}
              id="fullname"
              name="fullname"
              type="text"
              autoComplete="name"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              placeholder="Nama Lengkap"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
              Initial
            </label>
            <input
              onChange={userNameHandler}
              value={userName}
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
              Email
            </label>
            <input
              onChange={emailHandler}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              placeholder="email@lapi.co.id"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
              Password
            </label>
            <input
              onChange={passwordHandler}
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              placeholder="Password"
            />
          </div>

          <button
            onClick={() => addRegister()}
            type="button"
            disabled={!fullName || !userName || !email || !password}
            className="w-full mt-2 py-2.5 rounded-lg text-sm font-semibold tracking-wide transition
              bg-green-600 hover:bg-green-500 active:bg-green-700 text-white
              disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            Register
          </button>

          <p className="text-center text-sm text-gray-400 pt-1">
            Sudah punya akun?{" "}
            <a href="/" className="text-green-600 font-medium hover:text-green-500 transition">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;