import { useState } from "react";
import { Tabs, TabList, TabPanels, Tab, TabPanel } from "@chakra-ui/react";
import EnvironmentManagementSystem from "./EnvironmentManagementSystem";
import EnergyMeter from "./EnergyMeter";

// ═══════════════════════════════════════════════════════════════════
// Scadamonitor — MASTER
// Cuma bertugas jadi wadah 2 tab:
//   1) EMS           → EnvironmentManagementSystem.jsx (isi lama Scadamonitor.jsx)
//   2) Energy Meter  → EnergyMeter.jsx (3 flow meter + 10 power meter, baru)
// Semua state/WS/logic realtime ada di masing-masing file tab, bukan di sini.
// `isLazy` supaya tab yang belum dibuka tidak langsung connect WebSocket.
// ═══════════════════════════════════════════════════════════════════
const LS_ACTIVE_TAB = "scada_active_tab";

export default function Scadamonitor() {
  const [tabIndex, setTabIndex] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_ACTIVE_TAB);
      return raw !== null ? Number(raw) : 0;
    } catch {
      return 0;
    }
  });

  const handleTabChange = (index) => {
    setTabIndex(index);
    try {
      localStorage.setItem(LS_ACTIVE_TAB, String(index));
    } catch {
      // localStorage tidak tersedia — abaikan, fallback ke state saja
    }
  };

  return (
    <Tabs index={tabIndex} onChange={handleTabChange} colorScheme="blue" isLazy>
      <TabList px={4} pt={2} position="sticky" top={0} bg="chakra-body-bg" zIndex={10}>
        <Tab fontWeight="semibold">EMS</Tab>
        <Tab fontWeight="semibold">Energy Meter</Tab>
      </TabList>

      <TabPanels>
        <TabPanel p={0}>
          <EnvironmentManagementSystem />
        </TabPanel>
        <TabPanel p={0}>
          <EnergyMeter />
        </TabPanel>
      </TabPanels>
    </Tabs>
  );
}
