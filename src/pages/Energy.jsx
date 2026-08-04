import React from 'react'
import { useState, useEffect } from "react";
import { Tabs, TabList, TabPanels, Tab, TabPanel } from "@chakra-ui/react";
import EnergyPower from "./EnergyPower"
import EnergyWater from "./EnergyWater"


const API_BASE = "http://10.163.0.66:8002/part";



function Energy() {
  const [activeTab, setActiveTab] = useState(0); 
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
          <Tab>Power Meter</Tab>
          <Tab>Water Meter</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <EnergyPower apiBase={API_BASE} isDarkMode={isDarkMode} />
          </TabPanel>
          <TabPanel px={0}>
            <EnergyWater  apiBase={API_BASE} isDarkMode={isDarkMode} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  )
}

export default Energy