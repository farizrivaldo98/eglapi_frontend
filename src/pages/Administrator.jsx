import {
  Tabs, TabList, TabPanels, Tab, TabPanel,
} from "@chakra-ui/react";
import UserManagement from "./Usermanagement";
import PageManagement from "./Pagemanagement ";

export default function Administrator() {
  return (
    <div>
      {/* ── Page Title ─────────────────────────────────────────────── */}
      <div className="mx-6 mt-6 mb-1">
        <h1 className="text-2xl font-bold text-text">🛡️ Administrator</h1>
        <p className="text-sm text-gray-400">
          Kelola akun user & atur akses halaman per level.
        </p>
      </div>

      {/* ── Tabs: User Management / Page Management ──────────────────── */}
      <Tabs colorScheme="green" variant="soft-rounded" isLazy>
        <TabList mx="6" mt="4" gap={2}>
          <Tab fontSize="sm" fontWeight="medium">
            👤&nbsp; User Management
          </Tab>
          <Tab fontSize="sm" fontWeight="medium">
            🗂️&nbsp; Page Management
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel px={0} pt={2}>
            <UserManagement />
          </TabPanel>
          <TabPanel px={0} pt={2}>
            <PageManagement />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}