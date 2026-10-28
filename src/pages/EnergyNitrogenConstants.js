// ════════════════════════════════════════════════════════════════════════
// Konstanta halaman EnergyNitrogen.jsx
// ════════════════════════════════════════════════════════════════════════

// Daftar sumber N2. `key` HARUS sama dengan key di ENERGY_NITROGEN_SOURCES
// (backend). available:false = tampil di dropdown tapi di-disable (buram,
// gak bisa dipilih). Kalau sumber baru sudah siap: isi di backend, lalu
// ganti available jadi true di sini.
export const SOURCES = [
  { key: "n2_supply", label: "Supply N2", available: true },
  { key: "sterile", label: "Sterile", available: false },
  { key: "liquid", label: "Liquid", available: false },
  { key: "lt3", label: "LT3", available: false },
  { key: "lapi1", label: "Lapi1", available: false },
];

// Periode grafik flow rata-rata
export const FLOW_PERIODS = [
  { value: "minute", label: "Per Menit" },
  { value: "hourly", label: "Per Jam" },
  { value: "daily", label: "Per Hari" },
];

// Periode grafik totalizer
export const TOTALIZER_PERIODS = [
  { value: "hourly", label: "Per Jam" },
  { value: "daily", label: "Per Hari" },
];

// Batas rentang (hari) per periode - HARUS sama dengan maxDays di
// ENERGY_NITROGEN_PERIOD_CONFIG (backend). Dipakai buat hint di UI.
export const MAX_RANGE_DAYS = {
  minute: 3,
  hourly: 31,
  daily: 366,
};

// Satuan totalizer. Backend selalu balikin Liter, konversi di frontend.
export const VOLUME_UNITS = [
  { key: "L", label: "Liter (L)", short: "L", factor: 1, decimals: 2 },
  { key: "m3", label: "Meter kubik (m³)", short: "m³", factor: 0.001, decimals: 3 },
];

export const FLOW_UNIT = "L/min";

export const FLOW_COLOR = { light: "#1f77b4", dark: "#4dabf7" };
export const TOTALIZER_COLOR = { light: "#2a9d8f", dark: "#52d1c2" };
