import { useState, useEffect } from "react";
import {
  Table, Thead, Tbody, Tr, Th, Td,
  TableCaption, TableContainer,
  Button, Input, Select, Stack, Badge, Spinner,
  Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalFooter, ModalBody, ModalCloseButton,
  FormControl, FormLabel, Switch,
  useDisclosure, useColorMode, useColorModeValue, useToast,
} from "@chakra-ui/react";
import axios from "axios";
import { useSelector } from "react-redux";
import { logAuditAction } from "../features/part/userSlice";

const API = "http://10.163.0.66:8002";

const LEVEL_COLOR = { 1: "gray", 2: "blue", 3: "green", 4: "orange", 5: "red" };

export default function UserManagement() {
  const userGlobal = useSelector((state) => state.user.user);
  const toast = useToast();

  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);

  // Edit state
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]             = useState({});

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState(null);

  const {
    isOpen: isEditOpen,
    onOpen: onEditOpen,
    onClose: onEditClose,
  } = useDisclosure();

  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();

  // ── theming (same pattern as Utility.jsx) ──────────────────
  const { colorMode } = useColorMode();
  const tulisanColor  = useColorModeValue(
    "rgba(var(--color-text))",
    "rgba(var(--color-text))"
  );
  // ────────────────────────────────────────────────────────────

  // ── fetch all users ─────────────────────────────────────────
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("user_token");
      const res   = await axios.get(`${API}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(res.data);
    } catch (err) {
      toast({
        title: "Gagal memuat data user",
        description: err?.response?.data?.message || err.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);
  // ────────────────────────────────────────────────────────────

  // ── open edit modal ─────────────────────────────────────────
  const openEdit = (user) => {
    setEditTarget(user);
    setForm({
      username: user.username,
      name:     user.name,
      email:    user.email,
      level:    user.level ?? 1,
      isAdmin:  Number(user.isAdmin),
      password: "",
    });
    onEditOpen();
  };

  const setField = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));
  // ────────────────────────────────────────────────────────────

  // ── save edit ───────────────────────────────────────────────
  const handleEditSubmit = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("user_token");
      await axios.patch(`${API}/admin/users/${editTarget.id_users}`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });

      await logAuditAction("ADMIN_EDIT_USER", {
        target_id:   editTarget.id_users,
        target_name: editTarget.name,
      });

      toast({
        title: "User berhasil diupdate",
        status: "success",
        duration: 2000,
        isClosable: true,
      });
      onEditClose();
      fetchUsers();
    } catch (err) {
      toast({
        title: "Gagal update user",
        description: err?.response?.data?.message || err.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };
  // ────────────────────────────────────────────────────────────

  // ── open delete modal ────────────────────────────────────────
  const openDelete = (user) => {
    setDeleteTarget(user);
    onDeleteOpen();
  };

  // ── confirm delete ───────────────────────────────────────────
  const handleDelete = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("user_token");
      await axios.delete(`${API}/admin/users/${deleteTarget.id_users}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      await logAuditAction("ADMIN_DELETE_USER", {
        target_id:   deleteTarget.id_users,
        target_name: deleteTarget.name,
      });

      toast({
        title: `Akun "${deleteTarget.name}" dihapus`,
        status: "success",
        duration: 2000,
        isClosable: true,
      });
      onDeleteClose();
      fetchUsers();
    } catch (err) {
      toast({
        title: "Gagal menghapus user",
        description: err?.response?.data?.message || err.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };
  // ────────────────────────────────────────────────────────────

  // ── render table rows ────────────────────────────────────────
  const renderTable = () => {
    if (users.length === 0) {
      return (
        <Tr>
          <Td colSpan={7} textAlign="center" display="table-cell" sx={{ color: tulisanColor }}>
            No data available
          </Td>
        </Tr>
      );
    }

    return users.map((u) => (
      <Tr key={u.id_users}>
        <Td sx={{ color: tulisanColor }}>{u.id_users}</Td>
        <Td sx={{ color: tulisanColor }}>{u.username}</Td>
        <Td sx={{ color: tulisanColor }}>{u.name}</Td>
        <Td sx={{ color: tulisanColor }}>{u.email}</Td>
        <Td>
          <Badge colorScheme={LEVEL_COLOR[u.level] || "gray"}>
            Level {u.level ?? "-"}
          </Badge>
        </Td>
        <Td>
          <Badge colorScheme={Number(u.isAdmin) === 1 ? "green" : "gray"}>
            {Number(u.isAdmin) === 1 ? "Admin" : "User"}
          </Badge>
        </Td>
        <Td>
          <Stack direction="row" spacing={2}>
            <Button size="sm" colorScheme="blue" onClick={() => openEdit(u)}>
              Edit
            </Button>
            {/* Jangan tampilkan delete untuk diri sendiri */}
            {u.id_users !== (userGlobal.id || userGlobal.id_users) && (
              <Button size="sm" colorScheme="red" onClick={() => openDelete(u)}>
                Delete
              </Button>
            )}
          </Stack>
        </Td>
      </Tr>
    ));
  };
  // ────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-row justify-between items-center mx-6 mt-2 mb-4">
        <h2 className="text-lg font-bold text-text">User Management</h2>
        <Badge colorScheme="green" fontSize="0.8em" px={3} py={1}>
          Total: {users.length} user
        </Badge>
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      <div className="mt-4 mx-6 bg-card rounded-md shadow-lg">
        {loading ? (
          <div className="flex flex-col items-center py-12">
            <Spinner
              thickness="4px"
              speed="0.65s"
              emptyColor="gray.200"
              color="blue.500"
              size="xl"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <TableContainer>
              <Table key={colorMode} variant="simple">
                <TableCaption sx={{ color: tulisanColor }}>
                  User Management — PT. Lapi Laboratories
                </TableCaption>
                <Thead>
                  <Tr>
                    <Th sx={{ color: tulisanColor }}>ID</Th>
                    <Th sx={{ color: tulisanColor }}>Username</Th>
                    <Th sx={{ color: tulisanColor }}>Name</Th>
                    <Th sx={{ color: tulisanColor }}>Email</Th>
                    <Th sx={{ color: tulisanColor }}>Level</Th>
                    <Th sx={{ color: tulisanColor }}>Role</Th>
                    <Th sx={{ color: tulisanColor }}>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>{renderTable()}</Tbody>
              </Table>
            </TableContainer>
          </div>
        )}
      </div>

      {/* ── EDIT MODAL ──────────────────────────────────────── */}
      <Modal isOpen={isEditOpen} onClose={onEditClose} size="md" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader fontSize="md">
            ✏️ Edit User — <span className="font-normal">{editTarget?.name}</span>
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody>
            <Stack spacing={3}>
              <FormControl>
                <FormLabel fontSize="sm">Username</FormLabel>
                <Input
                  size="sm"
                  value={form.username || ""}
                  onChange={(e) => setField("username", e.target.value)}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Name</FormLabel>
                <Input
                  size="sm"
                  value={form.name || ""}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Email</FormLabel>
                <Input
                  size="sm"
                  type="email"
                  value={form.email || ""}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">
                  Password Baru{" "}
                  <span style={{ fontWeight: "normal", color: "gray" }}>
                    (kosongkan jika tidak diubah)
                  </span>
                </FormLabel>
                <Input
                  size="sm"
                  type="password"
                  placeholder="••••••••"
                  value={form.password || ""}
                  onChange={(e) => setField("password", e.target.value)}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Level (1 – 5)</FormLabel>
                <Select
                  size="sm"
                  value={form.level ?? 1}
                  onChange={(e) => setField("level", Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <option key={lvl} value={lvl}>
                      Level {lvl}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl display="flex" alignItems="center" gap={3}>
                <FormLabel fontSize="sm" mb={0}>
                  Administrator
                </FormLabel>
                <Switch
                  colorScheme="green"
                  isChecked={Number(form.isAdmin) === 1}
                  onChange={(e) => setField("isAdmin", e.target.checked ? 1 : 0)}
                />
                <Badge colorScheme={Number(form.isAdmin) === 1 ? "green" : "gray"}>
                  {Number(form.isAdmin) === 1 ? "Admin" : "User"}
                </Badge>
              </FormControl>
            </Stack>
          </ModalBody>

          <ModalFooter>
            <Stack direction="row" spacing={2}>
              <Button
                colorScheme="blue"
                size="sm"
                onClick={handleEditSubmit}
                isLoading={saving}
                loadingText="Menyimpan..."
              >
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={onEditClose} isDisabled={saving}>
                Cancel
              </Button>
            </Stack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── DELETE CONFIRM MODAL ─────────────────────────────── */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose} size="sm" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader fontSize="md">🗑️ Hapus Akun</ModalHeader>
          <ModalCloseButton />

          <ModalBody fontSize="sm">
            Yakin ingin menghapus akun{" "}
            <strong>{deleteTarget?.name}</strong> ({deleteTarget?.username})?{" "}
            Tindakan ini <strong>tidak dapat dibatalkan</strong>.
          </ModalBody>

          <ModalFooter>
            <Stack direction="row" spacing={2}>
              <Button
                colorScheme="red"
                size="sm"
                onClick={handleDelete}
                isLoading={saving}
                loadingText="Menghapus..."
              >
                Hapus
              </Button>
              <Button variant="ghost" size="sm" onClick={onDeleteClose} isDisabled={saving}>
                Batal
              </Button>
            </Stack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}