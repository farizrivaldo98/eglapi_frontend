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
  { key: "uty1",      label: "SDP UTILITY",   colorLight: "#1e90ff", colorDark: "#00bfff" },
  { key: "lapi1",     label: "SDP LAPI 1",  colorLight: "#32cd32", colorDark: "#00ff00" },
  { key: "SDP2_PRO1", label: "SDP2_PRO1", colorLight: "#ceff1e", colorDark: "#ceff1e" },
  { key: "SDP1_OFC1", label: "SDP1_OFC1", colorLight: "#cd32b8", colorDark: "#cd32b8" },
  { key: "PP_Chiller", label: "SDP CHILLER", colorLight: "#cd6b32", colorDark: "#cd6b32" },
  { key: "SDP1_OFC23", label: "SDP1_OFC23", colorLight: "#32b3cd", colorDark: "#32b3cd" },
  { key: "SDP2_PRO2", label: "SDP2_PRO2", colorLight: "#ae7294", colorDark: "#ae7294" },
  { key: "SDP1_OFC45", label: "SDP1_OFC45", colorLight: "#166d3c", colorDark: "#166d3c" },
  { key: "SDP2_OFC45", label: "SDP2_OFC45", colorLight: "#5c6d16", colorDark: "#5c6d16" },
  { key: "SDP_MC", label: "SDP MICRO", colorLight: "#d1c543", colorDark: "#d1c543" },
  { key: "PP_HVAC_Mezzanine3", label: "PP_HVAC_Mezzanine3", colorLight: "#5d43d1", colorDark: "#5d43d1" },
  { key: "PP_LP", label: "PP_LP", colorLight: "#d14343", colorDark: "#d14343" },
  { key: "SDP2_Pro3", label: "SDP2_Pro3", colorLight: "#43d1b2", colorDark: "#43d1b2" },
  { key: "LVMDP1", label: "LVMDP1", colorLight: "#d7ca8c", colorDark: "#d7ca8c" },






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
