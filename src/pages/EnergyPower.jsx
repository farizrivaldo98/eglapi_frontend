// ════════════════════════════════════════════════════════════════════════
// Wrapper - Tabs biar gak perlu daftar halaman baru di pagesConfig.js,
// cukup 1 entry "Energy Power" yang isinya 3 tab.
//
// Struktur file:
//   EnergyPower.jsx          <- ini (parent)
//   TotalEnergyAnalisa.jsx   <- Tab 1: Total Energy (Wh/kWh/MWh)
//   ParameterListrik.jsx     <- Tab 2: Analisa Parameter Listrik
//   PerbandinganMeter.jsx    <- Tab 3: Perbandingan Antar Meter
//   EnergyPowerConstants.js  <- Konstanta bersama (METERS, PARAMS, UNITS, dll)
// ════════════════════════════════════════════════════════════════════════
import { Tabs, TabList, TabPanels, Tab, TabPanel } from "@chakra-ui/react";
import TotalEnergyAnalisa from "./TotalEnergyAnalisa";
import ParameterListrik   from "./ParameterListrik";
import PerbandinganMeter  from "./PerbandinganMeter";

function EnergyPower() {
  return (
    <div>
      <Tabs variant="enclosed" colorScheme="blue" isFitted>
        <TabList className="w-full lg:w-1/2" display="flex">
          {/* <Tab>Total Energy</Tab> */}
          <Tab>Analisa Parameter Listrik</Tab>
          <Tab>Total Power Meter</Tab>
        </TabList>
        <TabPanels>
          {/* <TabPanel px={0}>
            <TotalEnergyAnalisa />
          </TabPanel> */}
          <TabPanel px={0}>
            <ParameterListrik />
          </TabPanel>
          <TabPanel px={0}>
            <PerbandinganMeter />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}

export default EnergyPower;
