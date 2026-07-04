import { useState, useEffect } from "react";
import { Tabs, TabList, TabPanels, Tab, TabPanel } from "@chakra-ui/react";
import ChillerRealtime from "./ChillerRealtime";
import ChillerHistorical from "./ChillerHistorical";

// ────────────────────────────────────────────────────────────
// KONFIGURASI CHILLER (dipakai bersama oleh ChillerRealtime & ChillerHistorical)
// ────────────────────────────────────────────────────────────
const API_BASE = "http://10.163.0.66:8002/part";

const CHANNELS = [
  { key: "CH1", label: "Chiller 1", table: "cMT-C21B_CH1_data", color: { light: "#1e6fd9", dark: "#60a5fa" } },
  { key: "CH2", label: "Chiller 2", table: "cMT-C21B_CH2_data", color: { light: "#e8590c", dark: "#fb923c" } },
  { key: "CH3", label: "Chiller 3", table: "cMT-C21B_CH3_data", color: { light: "#0f9960", dark: "#34d399" } },
  { key: "CH4", label: "Chiller 4", table: "cMT-C21B_CH4_data", color: { light: "#c2255c", dark: "#fb7185" } },
];

// urutan & key HARUS selaras sama urutan data_format_0..6 di tabel backend
const METRICS = [
  { key: "capacity", label: "Capacity", unit: "%" },
  { key: "current", label: "Current", unit: "A" },
  { key: "kwInput", label: "KW Input", unit: "kW" },
  { key: "kwOutput", label: "KW Output", unit: "kW" },
  { key: "cop", label: "COP", unit: "" },
  { key: "deltaT", label: "Delta T", unit: "°C" },
  { key: "kwTr", label: "KW/TR", unit: "kW/TR" },
];

function Chiller() {
  // ── STATE ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0); // 0 = Realtime, 1 = Historical

  // Deteksi tema dark/light sekali di sini, lalu dibagikan ke kedua tab
  // (biar cuma ada 1 MutationObserver yang jalan, sama seperti sebelum dipisah)
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.getAttribute("data-theme") === "dark"
  );

  useEffect(() => {
    const handleThemeChange = () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      setIsDarkMode(currentTheme === "dark");
    };
    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // ── RENDER UTAMA ─────────────────────────────────────────────
  return (
    <div>
      <Tabs
        index={activeTab}
        onChange={setActiveTab}
        isFitted
        variant="enclosed"
        colorScheme="blue"
        className="mx-4 md:mx-20 mt-4"
      >
        <TabList>
          <Tab>Realtime</Tab>
          <Tab>Historical</Tab>
        </TabList>
        <TabPanels>
          {/* TAB 0 - REALTIME */}
          <TabPanel px={0}>
            <ChillerRealtime channels={CHANNELS} metrics={METRICS} apiBase={API_BASE} isDarkMode={isDarkMode} />
          </TabPanel>

          {/* TAB 1 - HISTORICAL */}
          <TabPanel px={0}>
            <ChillerHistorical channels={CHANNELS} metrics={METRICS} apiBase={API_BASE} isDarkMode={isDarkMode} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}

export default Chiller;
