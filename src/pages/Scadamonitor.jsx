import { useState, useEffect, useRef } from "react";
import {
  Text, Table, Thead, Tbody, Tr, Th, Td,
  TableContainer, Badge, Stack, Button, Input, Select,
  Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalCloseButton, ModalBody, ModalFooter,
  useDisclosure, useColorModeValue, useToast, Switch,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { logAuditAction } from "../features/part/userSlice";
import { useNavigate } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────
// Alamat WebSocket Node-RED
// ─────────────────────────────────────────────────────────────────
const DEFAULT_WS_URL = "ws://10.163.0.66:1880/ws/scada";
const STATUS_DOT_COLOR = {
  live:       "bg-green-500",
  connecting: "bg-orange-500",
  down:       "bg-red-500",
};

// ─────────────────────────────────────────────────────────────────
// Derive semua nama tag PLC dari nama ruangan.
// Konvensi wajib sama dengan vartable di S7 Endpoint Node-RED:
//   DB3 : Tx_<Room>  Rx_<Room>  Px_<Room>
//   DB1 : Temp_<Room>_SP_L/H   Rh_<Room>_SP_L/H   Dp_<Room>_SP_L/H
//          Min_Tx_<Room>  Min_Rx_<Room>  Min_Px_<Room>
//          Buzzer_<Room>  (bit X.x)  — status alarm, read-only
//   M   : SB_<Room>  (bit, area M100.1–M102.2) — buzzer ON/OFF switch, writable
// ─────────────────────────────────────────────────────────────────
const getTagNames = (room) => ({
  Tx:           `Tx_${room}`,
  Rx:           `Rx_${room}`,
  Px:           `Px_${room}`,
  Buzzer:       `Buzzer_${room}`,
  BuzzerSwitch: `SB_${room}`,
  Temp_SP_L: `Temp_${room}_SP_L`,
  Temp_SP_H: `Temp_${room}_SP_H`,
  Rh_SP_L:   `Rh_${room}_SP_L`,
  Rh_SP_H:   `Rh_${room}_SP_H`,
  Dp_SP_L:   `Dp_${room}_SP_L`,
  Dp_SP_H:   `Dp_${room}_SP_H`,
  Timer_Tx:  `Min_Tx_${room}`,
  Timer_Rx:  `Min_Rx_${room}`,
  Timer_Px:  `Min_Px_${room}`,
});

// Tx → "Temp" | Rx → "Rh" | Px → "Dp"
const getTypeLabel = (type) =>
  type === "Tx" ? "Temp" : type === "Rx" ? "Rh" : "Dp";

// ─────────────────────────────────────────────────────────────────
export default function Scadamonitor() {
  // PLC realtime data (flat key-value dari Node-RED)
  const [data, setData]               = useState({});
  // Konfigurasi AHU [{ahu, rooms}] — dikirim dari Node-RED, bukan hardcode
  const [ahuConfig, setAhuConfig]     = useState([]);
  const [selectedAhu, setSelectedAhu] = useState(null);

  const [status, setStatus]           = useState("down");
  const [lastUpdate, setLastUpdate]   = useState(null);
  const [now, setNow]                 = useState(Date.now());

  // Edit limit modal
  const [popupData, setPopupData]     = useState(null);
  const [editSpL, setEditSpL]         = useState("");
  const [editSpH, setEditSpH]         = useState("");
  const [editTimer, setEditTimer]     = useState("");
  const [saving, setSaving]           = useState(false);

  // Buzzer switch modal
  const [buzzerPopup, setBuzzerPopup] = useState(null);
  const [editBuzzerOn, setEditBuzzerOn] = useState(false);
  const [savingBuzzer, setSavingBuzzer] = useState(false);

  const wsRef    = useRef(null);
  const toast    = useToast();
  const navigate = useNavigate();
  const { isOpen, onOpen, onClose }   = useDisclosure();
  const { isOpen: isBuzzerOpen, onOpen: onBuzzerOpen, onClose: onBuzzerClose } = useDisclosure();
  const userGlobal = useSelector((state) => state.user.user);

  // Ruangan yang tampil = rooms dari AHU yang sedang dipilih
  const currentAhu   = ahuConfig.find((a) => a.ahu === selectedAhu);
  const currentRooms = currentAhu?.rooms ?? [];

  // Bisa write jika level >= 3
  const canWrite = userGlobal?.level != null && userGlobal.level >= 3;

  // ──────────────── WebSocket ────────────────────────────────────
  const connectWS = () => {
    setStatus("connecting");
    wsRef.current?.close();
    const ws = new WebSocket(DEFAULT_WS_URL);

    ws.onopen  = () => setStatus("live");
    ws.onclose = () => setStatus("down");
    ws.onerror = () => setStatus("down");

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        // 1. Update data PLC realtime
        if (payload.data) {
          setData((prev) => ({ ...prev, ...payload.data }));
          setLastUpdate(Date.now());
        }

        // 2. Update konfigurasi AHU dari Node-RED (auto-generate tabel)
        if (Array.isArray(payload.ahuConfig) && payload.ahuConfig.length > 0) {
          setAhuConfig((prev) => {
            // Hanya update jika config benar-benar berubah
            if (JSON.stringify(prev) === JSON.stringify(payload.ahuConfig)) return prev;
            return payload.ahuConfig;
          });
          // Default pilih AHU pertama saat pertama kali terima config
          setSelectedAhu((prev) => prev ?? payload.ahuConfig[0]?.ahu ?? null);
        }
      } catch (e) {
        console.error("WS Parse Error:", e);
      }
    };

    wsRef.current = ws;
  };

  useEffect(() => {
    connectWS();
    return () => wsRef.current?.close();
  }, []);

  // Tick tiap 1 detik untuk "X detik lalu"
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Saat popup terbuka, isi field dengan nilai saat ini
  useEffect(() => {
    if (!popupData) return;
    setEditSpL(popupData.spL  != null ? String(popupData.spL)   : "");
    setEditSpH(popupData.spH  != null ? String(popupData.spH)   : "");
    setEditTimer(popupData.timer != null ? String(popupData.timer) : "");
  }, [popupData]);

  // Saat popup buzzer terbuka, isi switch dengan nilai saat ini
  // useEffect(() => {
  //   if (!buzzerPopup) return;
  //   setEditBuzzerOn(buzzerPopup.switchOn === true);
  // }, [buzzerPopup]);
  useEffect(() => {
  if (!buzzerPopup) return;
  setEditBuzzerOn(!buzzerPopup.switchOn);
}, [buzzerPopup]);

  // ──────────────── Helper alarm ─────────────────────────────────
  const isAlarm = (room, type, val) => {
    if (val == null) return false;
    const t   = getTagNames(room);
    const lbl = getTypeLabel(type);
    const spL = data[t[`${lbl}_SP_L`]];
    const spH = data[t[`${lbl}_SP_H`]];
    return (spL !== undefined && val < spL) ||
           (spH !== undefined && val > spH);
  };

  // ──────────────── Klik sel tabel → buka modal ─────────────────
  const handleTagClick = (room, type, val) => {
    const t   = getTagNames(room);
    const lbl = getTypeLabel(type);
    setPopupData({
      room, type, val,
      spL:   data[t[`${lbl}_SP_L`]],
      spH:   data[t[`${lbl}_SP_H`]],
      timer: data[t[`Timer_${type}`]],
    });
    onOpen();
  };

  // ──────────────── Simpan limit ke PLC ─────────────────────────
  const handleSaveToPlc = async () => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      toast({ title: "Koneksi WebSocket terputus", status: "error", duration: 3000 });
      return;
    }
    setSaving(true);

    const { room, type } = popupData;
    const t   = getTagNames(room);
    const lbl = getTypeLabel(type);
    let updated = false;

    const sendWrite = async (tagKey, oldVal, newVal, label) => {
      if (newVal === "" || Number(newVal) === oldVal) return;
      // Kirim write command ke Node-RED → PLC
      wsRef.current.send(
        JSON.stringify({ cmd: "write", tag: t[tagKey], value: Number(newVal) })
      );
      updated = true;
      // Catat audit log
      try {
        await logAuditAction("SCADA_EDIT_LIMIT", {
          ahu:           selectedAhu,
          target_station: room,
          parameter:     label,
          old_value:     oldVal,
          new_value:     Number(newVal),
          user_name:     userGlobal?.name,
        });
      } catch (err) {
        console.error(`Gagal log ${label}:`, err);
      }
    };

    await sendWrite(`${lbl}_SP_L`,   popupData.spL,   editSpL,   `Low Limit (${lbl})`);
    await sendWrite(`${lbl}_SP_H`,   popupData.spH,   editSpH,   `High Limit (${lbl})`);
    await sendWrite(`Timer_${type}`, popupData.timer, editTimer, `Timer (${lbl})`);

    if (updated) {
      toast({ title: "Perintah Write terkirim & Log tersimpan", status: "success", duration: 3000 });
    }
    setSaving(false);
    onClose();
  };

  // ──────────────── Klik sel Buzzer → buka modal switch ─────────
  const handleBuzzerClick = (room) => {
    const t = getTagNames(room);
    setBuzzerPopup({
      room,
      alarmActive: data[t.Buzzer] === true,
      switchOn:    data[t.BuzzerSwitch] === true,
    });
    onBuzzerOpen();
  };

  // ──────────────── Simpan switch buzzer ke PLC ──────────────────
  const handleSaveBuzzerToPlc = async () => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      toast({ title: "Koneksi WebSocket terputus", status: "error", duration: 3000 });
      return;
    }
    if (editBuzzerOn === buzzerPopup.switchOn) {
      onBuzzerClose();
      return;
    }
    setSavingBuzzer(true);

    const { room, switchOn } = buzzerPopup;
    const t = getTagNames(room);

    // Kirim write command ke Node-RED → PLC (bit M, lihat vartable S7 Endpoint)
    wsRef.current.send(
      JSON.stringify({ cmd: "write", tag: t.BuzzerSwitch, value: editBuzzerOn })
    );

    // Catat audit log
    try {
      await logAuditAction("SCADA_EDIT_LIMIT", {
        ahu:            selectedAhu,
        target_station: room,
        parameter:      "Buzzer Switch",
        old_value:      switchOn    ? "ON" : "OFF",
        new_value:      editBuzzerOn ? "ON" : "OFF",
        user_name:      userGlobal?.name,
      });
      toast({ title: "Perintah Write terkirim & Log tersimpan", status: "success", duration: 3000 });
    } catch (err) {
      console.error("Gagal log Buzzer Switch:", err);
      toast({ title: "Write terkirim, tapi gagal simpan log", status: "warning", duration: 3000 });
    }

    setSavingBuzzer(false);
    onBuzzerClose();
  };

  // ──────────────── Format waktu ─────────────────────────────────
  const elapsedSec = lastUpdate ? Math.floor((now - lastUpdate) / 1000) : null;
  const fmtElapsed = (s) =>
    s < 60 ? `${s} detik lalu` : `${Math.floor(s / 60)} menit lalu`;

  // ──────────────── Style ────────────────────────────────────────
  const borderColor = useColorModeValue("gray.400", "gray.600");
  const tdS = { borderWidth: "2px", borderColor, textAlign: "center", transition: "0.2s ease" };

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <style>{`
        @keyframes alertBlink {
          0%, 100% { background-color: transparent; }
          50%       { background-color: #fca5a5; color: #7f1d1d; }
        }
        .blinking-alarm { animation: alertBlink 1s infinite ease-in-out; font-weight: bold; cursor: pointer; }
        .normal-cell    { cursor: pointer; }
        .normal-cell:hover { background-color: rgba(0,0,0,0.05); }
      `}</style>

      {/* ── Top bar ───────────────────────────────────────────── */}
      <div className="p-4 flex gap-4 items-center flex-wrap">
        {userGlobal?.level == null && (
          <Button size="sm" onClick={() => navigate("/")} colorScheme="red">
            Back
          </Button>
        )}
        <Button onClick={connectWS} size="sm" colorScheme="blue">
          Reconnect WS
        </Button>

        {/* Status dot */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {status !== "down" && (
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${STATUS_DOT_COLOR[status]}`}
              />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${STATUS_DOT_COLOR[status]}`} />
          </span>
          <Text fontSize="sm" fontWeight="semibold">{status.toUpperCase()}</Text>
        </div>

        {elapsedSec !== null && (
          <Text fontSize="xs" color="gray.500">
            Data terakhir: {fmtElapsed(elapsedSec)}
          </Text>
        )}
      </div>

      {/* ── AHU Selector — auto-generate dari Node-RED config ─── */}
      {ahuConfig.length > 0 ? (
        <div className="mx-6 mb-4 flex flex-wrap gap-3 items-center bg-card rounded-md shadow-lg p-3">
          <span className="font-semibold text-gray-500">AHU:</span>
          <Select
            size="sm"
            width="180px"
            value={selectedAhu ?? ""}
            onChange={(e) => setSelectedAhu(e.target.value)}
          >
            {ahuConfig.map((a) => (
              <option key={a.ahu} value={a.ahu}>
                {a.ahu}
              </option>
            ))}
          </Select>

          <div className="flex items-center gap-2">
            <Badge colorScheme="blue">{currentRooms.length} ruangan</Badge>
            <Text fontSize="sm" fontWeight="medium">{selectedAhu}</Text>
          </div>
        </div>
      ) : (
        <div className="mx-6 mb-4 p-3 rounded-md border border-yellow-300 bg-yellow-50 text-yellow-700 text-sm">
          ⏳ Menunggu konfigurasi AHU dari Node-RED…
          <br />
          <span className="text-xs opacity-75">
            Pastikan Node-RED terkoneksi ke PLC dan flow sudah berjalan.
          </span>
        </div>
      )}

      {/* ── Tabel Ruangan — auto-generate dari rooms di config ── */}
      {currentRooms.length > 0 && (
        <div className="mx-6 mb-4 bg-card rounded-md shadow-lg p-2">
          <TableContainer>
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th sx={tdS}>Ruangan (Station)</Th>
                  <Th sx={tdS}>Tx · Suhu (°C)</Th>
                  <Th sx={tdS}>Rx · RH (%)</Th>
                  <Th sx={tdS}>Px · DP (Pa)</Th>
                  <Th sx={tdS}>Buzzer</Th>
                </Tr>
              </Thead>
              <Tbody>
                {currentRooms.map((room) => {
                  const t       = getTagNames(room);
                  const txVal   = data[t.Tx];
                  const rxVal   = data[t.Rx];
                  const pxVal   = data[t.Px];
                  const buzzerOn       = data[t.Buzzer] === true;
                  const buzzerSwitchOn = data[t.BuzzerSwitch] === true;

                  const cls = (type, val) =>
                    isAlarm(room, type, val) ? "blinking-alarm" : "normal-cell";

                  return (
                    <Tr key={room}>
                      <Td sx={{ ...tdS, textAlign: "left", fontWeight: "bold" }}>
                        {room}
                      </Td>

                      <Td sx={tdS} className={cls("Tx", txVal)}
                          onClick={() => handleTagClick(room, "Tx", txVal)}>
                        {txVal != null ? txVal.toFixed(1) : "—"}
                      </Td>

                      <Td sx={tdS} className={cls("Rx", rxVal)}
                          onClick={() => handleTagClick(room, "Rx", rxVal)}>
                        {rxVal != null ? rxVal.toFixed(1) : "—"}
                      </Td>

                      <Td sx={tdS} className={cls("Px", pxVal)}
                          onClick={() => handleTagClick(room, "Px", pxVal)}>
                        {pxVal != null ? pxVal.toFixed(1) : "—"}
                      </Td>

                      <Td sx={tdS} className="normal-cell"
                          onClick={() => handleBuzzerClick(room)}>
                        <Stack spacing={1} align="center">
                          {buzzerOn ? (
                            <Badge colorScheme="red" className="animate-pulse">
                              🚨 ACTIVE
                            </Badge>
                          ) : (
                            <Badge colorScheme="green">OK</Badge>
                          )}
                          {/* <Badge
                            fontSize="9px"
                            variant="outline"
                            colorScheme={buzzerSwitchOn ? "green" : "gray"}
                          >
                            SW {buzzerSwitchOn ? "ON" : "OFF"}
                          </Badge> */}
                        </Stack>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      {/* ── Modal Edit Limit ────────────────────────────────────── */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader borderBottomWidth="1px">
            Set Limit — {popupData?.room} [{popupData?.type}]
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody py={4}>
            <Stack spacing={3}>
              {/* Info rows */}
              {[
                ["AHU",       selectedAhu],
                ["Ruangan",   popupData?.room],
                ["Parameter", popupData?.type],
              ].map(([lbl, val]) => (
                <div key={lbl} className="flex justify-between items-center border-b pb-2">
                  <span className="font-semibold text-gray-500">{lbl}</span>
                  <span className="font-bold">{val}</span>
                </div>
              ))}

              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-semibold text-gray-500">Current Value</span>
                <span className="font-bold text-blue-600">
                  {typeof popupData?.val === "number"
                    ? popupData.val.toFixed(1)
                    : (popupData?.val ?? "—")}
                </span>
              </div>

              {/* High / Low limit */}
              {[
                ["High Limit (SP_H)", editSpH, setEditSpH],
                ["Low Limit (SP_L)",  editSpL, setEditSpL],
              ].map(([lbl, val, setter]) => (
                <div key={lbl} className="flex justify-between items-center border-b pb-2">
                  <span className="font-semibold text-gray-500">{lbl}</span>
                  <Input
                    size="sm" width="120px" type="number" step="0.1"
                    value={val}
                    isDisabled={!canWrite}
                    onChange={(e) => setter(e.target.value)}
                  />
                </div>
              ))}

              {/* Timer */}
              <div className="flex justify-between items-center pb-2">
                <span className="font-semibold text-gray-500">Timer Limit (menit)</span>
                <Input
                  size="sm" width="120px" type="number"
                  value={editTimer}
                  isDisabled={!canWrite}
                  onChange={(e) => setEditTimer(e.target.value)}
                />
              </div>

              {!canWrite && (
                <Text fontSize="xs" color="red.400" textAlign="center">
                  ⚠️ Level akses tidak mencukupi untuk edit limit (butuh Level 3+)
                </Text>
              )}
            </Stack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose} isDisabled={saving}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleSaveToPlc}
              isDisabled={!canWrite}
              isLoading={saving}
              loadingText="Saving…"
            >
              Save to PLC
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Modal Buzzer Switch ─────────────────────────────────── */}
      <Modal isOpen={isBuzzerOpen} onClose={onBuzzerClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader borderBottomWidth="1px">
            Buzzer Switch — {buzzerPopup?.room}
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody py={4}>
            <Stack spacing={3}>
              {/* Info rows */}
              {[
                ["AHU",     selectedAhu],
                ["Ruangan", buzzerPopup?.room],
              ].map(([lbl, val]) => (
                <div key={lbl} className="flex justify-between items-center border-b pb-2">
                  <span className="font-semibold text-gray-500">{lbl}</span>
                  <span className="font-bold">{val}</span>
                </div>
              ))}

              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-semibold text-gray-500">Status Alarm</span>
                {buzzerPopup?.alarmActive ? (
                  <Badge colorScheme="red" className="animate-pulse">
                    🚨 ACTIVE
                  </Badge>
                ) : (
                  <Badge colorScheme="green">OK</Badge>
                )}
              </div>

              {/* Switch on/off */}
              <div className="flex justify-between items-center pb-2">
                <span className="font-semibold text-gray-500">Buzzer Switch</span>
                <Stack direction="row" align="center" spacing={3}>
                  <Text
                    fontSize="sm"
                    fontWeight="bold"
                    color={editBuzzerOn ? "green.500" : "gray.500"}
                  >
                    {editBuzzerOn ? "ON" : "OFF"}
                  </Text>
                  <Switch
                    colorScheme="green"
                    isChecked={editBuzzerOn}
                    isDisabled={!canWrite}
                    onChange={(e) => setEditBuzzerOn(e.target.checked)}
                  />
                </Stack>
              </div>

              {!canWrite && (
                <Text fontSize="xs" color="red.400" textAlign="center">
                  ⚠️ Level akses tidak mencukupi untuk ubah buzzer (butuh Level 3+)
                </Text>
              )}
            </Stack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onBuzzerClose} isDisabled={savingBuzzer}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleSaveBuzzerToPlc}
              isDisabled={!canWrite}
              isLoading={savingBuzzer}
              loadingText="Saving…"
            >
              Save to PLC
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}