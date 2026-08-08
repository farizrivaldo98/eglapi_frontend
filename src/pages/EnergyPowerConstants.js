// ════════════════════════════════════════════════════════════════════════
// Konstanta bersama - dipakai oleh TotalEnergyAnalisa, ParameterListrik,
// dan PerbandinganMeter. Tambah entry di METERS atau PARAMS di sini,
// semua panel otomatis ikut update.
// ════════════════════════════════════════════════════════════════════════

export const PERIOD_LABELS = {
  hourly: "Per Jam",
  daily: "Per Hari",
  monthly: "Per Bulan",
};

// Backend (getEnergyPowerHistorical) SELALU balikin value dalam satuan Wh
// (lihat data_format_4 = Total Energy (Wh) di databaseControllers.js).
// Konversi Wh -> kWh -> MWh murni dilakukan di sini (frontend), tinggal
// kalikan raw value (Wh) dengan factor di bawah. Decimals dibedakan per
// satuan biar MWh (angkanya kecil) tetap kebaca, bukan 0.000.
export const UNITS = {
  wh:  { key: "wh",  label: "Wh",  factor: 1,      decimals: 2 },
  kwh: { key: "kwh", label: "kWh", factor: 1 / 1e3, decimals: 3 },
  mwh: { key: "mwh", label: "MWh", factor: 1 / 1e6, decimals: 5 },
};

// Daftar meter yang bisa dipilih di dropdown. Backend cuma query 1 tabel
// sesuai `meter` yang dikirim (lihat ENERGY_POWER_TABLES di
// databaseControllers.js). Dipakai bareng-bareng sama semua tab karena
// sumber tabelnya sama.
export const METERS = [
  { key: "uty1",      label: "PP UTY1",   colorLight: "#1e90ff", colorDark: "#00bfff" },
  { key: "lapi1",     label: "PP LAPI1",  colorLight: "#32cd32", colorDark: "#00ff00" },
  { key: "SDP2_Pro1", label: "SDP2_Pro1", colorLight: "#ceff1e", colorDark: "#ceff1e" },
  { key: "SDP1_Ofc1", label: "SDP1_Ofc1", colorLight: "#cd32b8", colorDark: "#cd32b8" },
];

// Parameter listrik instan (data_format_0..3) - BUKAN totalizer, jadi
// dianalisa pakai AVG/MAX/MIN per periode (bukan delta kayak Total Energy).
// Tambah entry di sini kalau nanti ada parameter baru, harus sinkron sama
// key di response backend (voltage/current/power/frequency).
export const PARAMS = [
  { key: "voltage",   label: "Tegangan L-N", unit: "V",  colorLight: "#1e90ff", colorDark: "#00bfff" },
  { key: "current",   label: "Arus",         unit: "A",  colorLight: "#32cd32", colorDark: "#00ff00" },
  { key: "power",     label: "Daya",         unit: "kW", colorLight: "#ff8c00", colorDark: "#ffa500" },
  { key: "frequency", label: "Frekuensi",    unit: "Hz", colorLight: "#a855f7", colorDark: "#c084fc" },
];
