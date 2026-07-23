// import { useState, useEffect, useRef } from "react";
// import {
//   Text, Table, Thead, Tbody, Tr, Th, Td,
//   TableContainer, Badge, Stack, Button, Input, Select,
//   Modal, ModalOverlay, ModalContent, ModalHeader,
//   ModalCloseButton, ModalBody, ModalFooter,
//   useDisclosure, useColorModeValue, useToast, Switch,
// } from "@chakra-ui/react";
// import { useSelector } from "react-redux";
// import { logAuditAction } from "../features/part/userSlice";
// import { useNavigate } from "react-router-dom";

// // ─────────────────────────────────────────────────────────────────
// // Alamat WebSocket Node-RED
// // ─────────────────────────────────────────────────────────────────
// const DEFAULT_WS_URL = "ws://10.163.0.66:1880/ws/scada";
// const STATUS_DOT_COLOR = {
//   live:       "bg-green-500",
//   connecting: "bg-orange-500",
//   down:       "bg-red-500",
// };

// // ─────────────────────────────────────────────────────────────────
// // Derive semua nama tag PLC dari nama ruangan.
// // Konvensi wajib sama dengan vartable di S7 Endpoint Node-RED:
// //   DB3 : Tx_<Room>  Rx_<Room>  Px_<Room>
// //   DB1 : Temp_<Room>_SP_L/H   Rh_<Room>_SP_L/H   Dp_<Room>_SP_L/H
// //          Min_Tx_<Room>  Min_Rx_<Room>  Min_Px_<Room>
// //          Buzzer_<Room>  (bit X.x)  — status alarm, read-only
// //   M   : SB_<Room>  (bit, area M100.1–M102.2) — buzzer ON/OFF switch, writable
// // ─────────────────────────────────────────────────────────────────
// const getTagNames = (room) => ({
//   Tx:           `Tx_${room}`,
//   Rx:           `Rx_${room}`,
//   Px:           `Px_${room}`,
//   Buzzer:       `Buzzer_${room}`,
//   BuzzerSwitch: `SB_${room}`,
//   Temp_SP_L: `Temp_${room}_SP_L`,
//   Temp_SP_H: `Temp_${room}_SP_H`,
//   Rh_SP_L:   `Rh_${room}_SP_L`,
//   Rh_SP_H:   `Rh_${room}_SP_H`,
//   Dp_SP_L:   `Dp_${room}_SP_L`,
//   Dp_SP_H:   `Dp_${room}_SP_H`,
//   Timer_Tx:  `Min_Tx_${room}`,
//   Timer_Rx:  `Min_Rx_${room}`,
//   Timer_Px:  `Min_Px_${room}`,
// });

// // Tx → "Temp" | Rx → "Rh" | Px → "Dp"
// const getTypeLabel = (type) =>
//   type === "Tx" ? "Temp" : type === "Rx" ? "Rh" : "Dp";

// // ─────────────────────────────────────────────────────────────────
// export default function Scadamonitor() {
//   // PLC realtime data (flat key-value dari Node-RED)
//   const [data, setData]               = useState({});
//   // Konfigurasi AHU [{ahu, rooms}] — dikirim dari Node-RED, bukan hardcode
//   const [ahuConfig, setAhuConfig]     = useState([]);
//   const [selectedAhu, setSelectedAhu] = useState(null);

//   const [status, setStatus]           = useState("down");
//   const [lastUpdate, setLastUpdate]   = useState(null);
//   const [now, setNow]                 = useState(Date.now());

//   // Edit limit modal
//   const [popupData, setPopupData]     = useState(null);
//   const [editSpL, setEditSpL]         = useState("");
//   const [editSpH, setEditSpH]         = useState("");
//   const [editTimer, setEditTimer]     = useState("");
//   const [saving, setSaving]           = useState(false);

//   // Buzzer switch modal
//   const [buzzerPopup, setBuzzerPopup] = useState(null);
//   const [editBuzzerOn, setEditBuzzerOn] = useState(false);
//   const [savingBuzzer, setSavingBuzzer] = useState(false);

//   const wsRef    = useRef(null);
//   const toast    = useToast();
//   const navigate = useNavigate();
//   const { isOpen, onOpen, onClose }   = useDisclosure();
//   const { isOpen: isBuzzerOpen, onOpen: onBuzzerOpen, onClose: onBuzzerClose } = useDisclosure();
//   const userGlobal = useSelector((state) => state.user.user);

//   // Ruangan yang tampil = rooms dari AHU yang sedang dipilih
//   const currentAhu   = ahuConfig.find((a) => a.ahu === selectedAhu);
//   const currentRooms = currentAhu?.rooms ?? [];

//   // Bisa write jika level >= 3
//   const canWrite = userGlobal?.level != null && userGlobal.level >= 3;

//   // ──────────────── WebSocket ────────────────────────────────────
//   const connectWS = () => {
//     setStatus("connecting");
//     wsRef.current?.close();
//     const ws = new WebSocket(DEFAULT_WS_URL);

//     ws.onopen  = () => setStatus("live");
//     ws.onclose = () => setStatus("down");
//     ws.onerror = () => setStatus("down");

//     ws.onmessage = (event) => {
//       try {
//         const payload = JSON.parse(event.data);

//         // 1. Update data PLC realtime
//         if (payload.data) {
//           setData((prev) => ({ ...prev, ...payload.data }));
//           setLastUpdate(Date.now());
//         }

//         // 2. Update konfigurasi AHU dari Node-RED (auto-generate tabel)
//         if (Array.isArray(payload.ahuConfig) && payload.ahuConfig.length > 0) {
//           setAhuConfig((prev) => {
//             // Hanya update jika config benar-benar berubah
//             if (JSON.stringify(prev) === JSON.stringify(payload.ahuConfig)) return prev;
//             return payload.ahuConfig;
//           });
//           // Default pilih AHU pertama saat pertama kali terima config
//           setSelectedAhu((prev) => prev ?? payload.ahuConfig[0]?.ahu ?? null);
//         }
//       } catch (e) {
//         console.error("WS Parse Error:", e);
//       }
//     };

//     wsRef.current = ws;
//   };

//   useEffect(() => {
//     connectWS();
//     return () => wsRef.current?.close();
//   }, []);

//   // Tick tiap 1 detik untuk "X detik lalu"
//   useEffect(() => {
//     const id = setInterval(() => setNow(Date.now()), 1000);
//     return () => clearInterval(id);
//   }, []);

//   // Saat popup terbuka, isi field dengan nilai saat ini
//   useEffect(() => {
//     if (!popupData) return;
//     setEditSpL(popupData.spL  != null ? String(popupData.spL)   : "");
//     setEditSpH(popupData.spH  != null ? String(popupData.spH)   : "");
//     setEditTimer(popupData.timer != null ? String(popupData.timer) : "");
//   }, [popupData]);

//   // Saat popup buzzer terbuka, isi switch dengan nilai saat ini
//   useEffect(() => {
//     if (!buzzerPopup) return;
//     setEditBuzzerOn(buzzerPopup.switchOn === true);
//   }, [buzzerPopup]);

//   // ──────────────── Helper alarm ─────────────────────────────────
//   const isAlarm = (room, type, val) => {
//     if (val == null) return false;
//     const t   = getTagNames(room);
//     const lbl = getTypeLabel(type);
//     const spL = data[t[`${lbl}_SP_L`]];
//     const spH = data[t[`${lbl}_SP_H`]];
//     return (spL !== undefined && val < spL) ||
//            (spH !== undefined && val > spH);
//   };

//   // ──────────────── Klik sel tabel → buka modal ─────────────────
//   const handleTagClick = (room, type, val) => {
//     const t   = getTagNames(room);
//     const lbl = getTypeLabel(type);
//     setPopupData({
//       room, type, val,
//       spL:   data[t[`${lbl}_SP_L`]],
//       spH:   data[t[`${lbl}_SP_H`]],
//       timer: data[t[`Timer_${type}`]],
//     });
//     onOpen();
//   };

//   // ──────────────── Simpan limit ke PLC ─────────────────────────
//   const handleSaveToPlc = async () => {
//     if (wsRef.current?.readyState !== WebSocket.OPEN) {
//       toast({ title: "Koneksi WebSocket terputus", status: "error", duration: 3000 });
//       return;
//     }
//     setSaving(true);

//     const { room, type } = popupData;
//     const t   = getTagNames(room);
//     const lbl = getTypeLabel(type);
//     let updated = false;

//     const sendWrite = async (tagKey, oldVal, newVal, label) => {
//       if (newVal === "" || Number(newVal) === oldVal) return;
//       // Kirim write command ke Node-RED → PLC
//       wsRef.current.send(
//         JSON.stringify({ cmd: "write", tag: t[tagKey], value: Number(newVal) })
//       );
//       updated = true;
//       // Catat audit log
//       try {
//         await logAuditAction("SCADA_EDIT_LIMIT", {
//           ahu:           selectedAhu,
//           target_station: room,
//           parameter:     label,
//           old_value:     oldVal,
//           new_value:     Number(newVal),
//           user_name:     userGlobal?.name,
//         });
//       } catch (err) {
//         console.error(`Gagal log ${label}:`, err);
//       }
//     };

//     await sendWrite(`${lbl}_SP_L`,   popupData.spL,   editSpL,   `Low Limit (${lbl})`);
//     await sendWrite(`${lbl}_SP_H`,   popupData.spH,   editSpH,   `High Limit (${lbl})`);
//     await sendWrite(`Timer_${type}`, popupData.timer, editTimer, `Timer (${lbl})`);

//     if (updated) {
//       toast({ title: "Perintah Write terkirim & Log tersimpan", status: "success", duration: 3000 });
//     }
//     setSaving(false);
//     onClose();
//   };

//   // ──────────────── Klik sel Buzzer → buka modal switch ─────────
//   const handleBuzzerClick = (room) => {
//     const t = getTagNames(room);
//     setBuzzerPopup({
//       room,
//       alarmActive: data[t.Buzzer] === true,
//       switchOn:    data[t.BuzzerSwitch] === true,
//     });
//     onBuzzerOpen();
//   };

//   // ──────────────── Simpan switch buzzer ke PLC ──────────────────
//   const handleSaveBuzzerToPlc = async () => {
//     if (wsRef.current?.readyState !== WebSocket.OPEN) {
//       toast({ title: "Koneksi WebSocket terputus", status: "error", duration: 3000 });
//       return;
//     }
//     if (editBuzzerOn === buzzerPopup.switchOn) {
//       onBuzzerClose();
//       return;
//     }
//     setSavingBuzzer(true);

//     const { room, switchOn } = buzzerPopup;
//     const t = getTagNames(room);

//     // Kirim write command ke Node-RED → PLC (bit M, lihat vartable S7 Endpoint)
//     wsRef.current.send(
//       JSON.stringify({ cmd: "write", tag: t.BuzzerSwitch, value: editBuzzerOn })
//     );

//     // Catat audit log
//     try {
//       await logAuditAction("SCADA_EDIT_LIMIT", {
//         ahu:            selectedAhu,
//         target_station: room,
//         parameter:      "Buzzer Switch",
//         old_value:      switchOn    ? "ON" : "OFF",
//         new_value:      editBuzzerOn ? "ON" : "OFF",
//         user_name:      userGlobal?.name,
//       });
//       toast({ title: "Perintah Write terkirim & Log tersimpan", status: "success", duration: 3000 });
//     } catch (err) {
//       console.error("Gagal log Buzzer Switch:", err);
//       toast({ title: "Write terkirim, tapi gagal simpan log", status: "warning", duration: 3000 });
//     }

//     setSavingBuzzer(false);
//     onBuzzerClose();
//   };

//   // ──────────────── Format waktu ─────────────────────────────────
//   const elapsedSec = lastUpdate ? Math.floor((now - lastUpdate) / 1000) : null;
//   const fmtElapsed = (s) =>
//     s < 60 ? `${s} detik lalu` : `${Math.floor(s / 60)} menit lalu`;

//   // ──────────────── Style ────────────────────────────────────────
//   const borderColor = useColorModeValue("gray.400", "gray.600");
//   const tdS = { borderWidth: "2px", borderColor, textAlign: "center", transition: "0.2s ease" };

//   // ══════════════════════════════════════════════════════════════
//   // RENDER
//   // ══════════════════════════════════════════════════════════════
//   return (
//     <div className="flex flex-col min-h-screen bg-background">
//       <style>{`
//         @keyframes alertBlink {
//           0%, 100% { background-color: transparent; }
//           50%       { background-color: #fca5a5; color: #7f1d1d; }
//         }
//         .blinking-alarm { animation: alertBlink 1s infinite ease-in-out; font-weight: bold; cursor: pointer; }
//         .normal-cell    { cursor: pointer; }
//         .normal-cell:hover { background-color: rgba(0,0,0,0.05); }
//       `}</style>

//       {/* ── Top bar ───────────────────────────────────────────── */}
//       <div className="p-4 flex gap-4 items-center flex-wrap">
//         {userGlobal?.level == null && (
//           <Button size="sm" onClick={() => navigate("/")} colorScheme="red">
//             Back
//           </Button>
//         )}
//         <Button onClick={connectWS} size="sm" colorScheme="blue">
//           Reconnect WS
//         </Button>

//         {/* Status dot */}
//         <div className="flex items-center gap-2">
//           <span className="relative flex h-2.5 w-2.5">
//             {status !== "down" && (
//               <span
//                 className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${STATUS_DOT_COLOR[status]}`}
//               />
//             )}
//             <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${STATUS_DOT_COLOR[status]}`} />
//           </span>
//           <Text fontSize="sm" fontWeight="semibold">{status.toUpperCase()}</Text>
//         </div>

//         {elapsedSec !== null && (
//           <Text fontSize="xs" color="gray.500">
//             Data terakhir: {fmtElapsed(elapsedSec)}
//           </Text>
//         )}
//       </div>

//       {/* ── AHU Selector — auto-generate dari Node-RED config ─── */}
//       {ahuConfig.length > 0 ? (
//         <div className="mx-6 mb-4 flex flex-wrap gap-3 items-center bg-card rounded-md shadow-lg p-3">
//           <span className="font-semibold text-gray-500">AHU:</span>
//           <Select
//             size="sm"
//             width="180px"
//             value={selectedAhu ?? ""}
//             onChange={(e) => setSelectedAhu(e.target.value)}
//           >
//             {ahuConfig.map((a) => (
//               <option key={a.ahu} value={a.ahu}>
//                 {a.ahu}
//               </option>
//             ))}
//           </Select>

//           <div className="flex items-center gap-2">
//             <Badge colorScheme="blue">{currentRooms.length} ruangan</Badge>
//             <Text fontSize="sm" fontWeight="medium">{selectedAhu}</Text>
//           </div>
//         </div>
//       ) : (
//         <div className="mx-6 mb-4 p-3 rounded-md border border-yellow-300 bg-yellow-50 text-yellow-700 text-sm">
//           ⏳ Menunggu konfigurasi AHU dari Node-RED…
//           <br />
//           <span className="text-xs opacity-75">
//             Pastikan Node-RED terkoneksi ke PLC dan flow sudah berjalan.
//           </span>
//         </div>
//       )}

//       {/* ── Tabel Ruangan — auto-generate dari rooms di config ── */}
//       {currentRooms.length > 0 && (
//         <div className="mx-6 mb-4 bg-card rounded-md shadow-lg p-2">
//           <TableContainer>
//             <Table variant="simple" size="sm">
//               <Thead>
//                 <Tr>
//                   <Th sx={tdS}>Ruangan (Station)</Th>
//                   <Th sx={tdS}>Tx · Suhu (°C)</Th>
//                   <Th sx={tdS}>Rx · RH (%)</Th>
//                   <Th sx={tdS}>Px · DP (Pa)</Th>
//                   <Th sx={tdS}>Buzzer</Th>
//                 </Tr>
//               </Thead>
//               <Tbody>
//                 {currentRooms.map((room) => {
//                   const t       = getTagNames(room);
//                   const txVal   = data[t.Tx];
//                   const rxVal   = data[t.Rx];
//                   const pxVal   = data[t.Px];
//                   const buzzerOn       = data[t.Buzzer] === true;
//                   const buzzerSwitchOn = data[t.BuzzerSwitch] === true;

//                   const cls = (type, val) =>
//                     isAlarm(room, type, val) ? "blinking-alarm" : "normal-cell";

//                   return (
//                     <Tr key={room}>
//                       <Td sx={{ ...tdS, textAlign: "left", fontWeight: "bold" }}>
//                         {room}
//                       </Td>

//                       <Td sx={tdS} className={cls("Tx", txVal)}
//                           onClick={() => handleTagClick(room, "Tx", txVal)}>
//                         {txVal != null ? txVal.toFixed(1) : "—"}
//                       </Td>

//                       <Td sx={tdS} className={cls("Rx", rxVal)}
//                           onClick={() => handleTagClick(room, "Rx", rxVal)}>
//                         {rxVal != null ? rxVal.toFixed(1) : "—"}
//                       </Td>

//                       <Td sx={tdS} className={cls("Px", pxVal)}
//                           onClick={() => handleTagClick(room, "Px", pxVal)}>
//                         {pxVal != null ? pxVal.toFixed(1) : "—"}
//                       </Td>

//                       <Td sx={tdS} className="normal-cell"
//                           onClick={() => handleBuzzerClick(room)}>
//                         <Stack spacing={1} align="center">
//                           {buzzerOn ? (
//                             <Badge colorScheme="red" className="animate-pulse">
//                               🚨 ACTIVE
//                             </Badge>
//                           ) : (
//                             <Badge colorScheme="green">OK</Badge>
//                           )}
//                           {/* <Badge
//                             fontSize="9px"
//                             variant="outline"
//                             colorScheme={buzzerSwitchOn ? "green" : "gray"}
//                           >
//                             SW {buzzerSwitchOn ? "ON" : "OFF"}
//                           </Badge> */}
//                         </Stack>
//                       </Td>
//                     </Tr>
//                   );
//                 })}
//               </Tbody>
//             </Table>
//           </TableContainer>
//         </div>
//       )}

//       {/* ── Modal Edit Limit ────────────────────────────────────── */}
//       <Modal isOpen={isOpen} onClose={onClose} isCentered>
//         <ModalOverlay />
//         <ModalContent>
//           <ModalHeader borderBottomWidth="1px">
//             Set Limit — {popupData?.room} [{popupData?.type}]
//           </ModalHeader>
//           <ModalCloseButton />

//           <ModalBody py={4}>
//             <Stack spacing={3}>
//               {/* Info rows */}
//               {[
//                 ["AHU",       selectedAhu],
//                 ["Ruangan",   popupData?.room],
//                 ["Parameter", popupData?.type],
//               ].map(([lbl, val]) => (
//                 <div key={lbl} className="flex justify-between items-center border-b pb-2">
//                   <span className="font-semibold text-gray-500">{lbl}</span>
//                   <span className="font-bold">{val}</span>
//                 </div>
//               ))}

//               <div className="flex justify-between items-center border-b pb-2">
//                 <span className="font-semibold text-gray-500">Current Value</span>
//                 <span className="font-bold text-blue-600">
//                   {typeof popupData?.val === "number"
//                     ? popupData.val.toFixed(1)
//                     : (popupData?.val ?? "—")}
//                 </span>
//               </div>

//               {/* High / Low limit */}
//               {[
//                 ["High Limit (SP_H)", editSpH, setEditSpH],
//                 ["Low Limit (SP_L)",  editSpL, setEditSpL],
//               ].map(([lbl, val, setter]) => (
//                 <div key={lbl} className="flex justify-between items-center border-b pb-2">
//                   <span className="font-semibold text-gray-500">{lbl}</span>
//                   <Input
//                     size="sm" width="120px" type="number" step="0.1"
//                     value={val}
//                     isDisabled={!canWrite}
//                     onChange={(e) => setter(e.target.value)}
//                   />
//                 </div>
//               ))}

//               {/* Timer */}
//               <div className="flex justify-between items-center pb-2">
//                 <span className="font-semibold text-gray-500">Timer Limit (menit)</span>
//                 <Input
//                   size="sm" width="120px" type="number"
//                   value={editTimer}
//                   isDisabled={!canWrite}
//                   onChange={(e) => setEditTimer(e.target.value)}
//                 />
//               </div>

//               {!canWrite && (
//                 <Text fontSize="xs" color="red.400" textAlign="center">
//                   ⚠️ Level akses tidak mencukupi untuk edit limit (butuh Level 3+)
//                 </Text>
//               )}
//             </Stack>
//           </ModalBody>

//           <ModalFooter>
//             <Button variant="ghost" mr={3} onClick={onClose} isDisabled={saving}>
//               Cancel
//             </Button>
//             <Button
//               colorScheme="blue"
//               onClick={handleSaveToPlc}
//               isDisabled={!canWrite}
//               isLoading={saving}
//               loadingText="Saving…"
//             >
//               Save to PLC
//             </Button>
//           </ModalFooter>
//         </ModalContent>
//       </Modal>

//       {/* ── Modal Buzzer Switch ─────────────────────────────────── */}
//       <Modal isOpen={isBuzzerOpen} onClose={onBuzzerClose} isCentered>
//         <ModalOverlay />
//         <ModalContent>
//           <ModalHeader borderBottomWidth="1px">
//             Buzzer Switch — {buzzerPopup?.room}
//           </ModalHeader>
//           <ModalCloseButton />

//           <ModalBody py={4}>
//             <Stack spacing={3}>
//               {/* Info rows */}
//               {[
//                 ["AHU",     selectedAhu],
//                 ["Ruangan", buzzerPopup?.room],
//               ].map(([lbl, val]) => (
//                 <div key={lbl} className="flex justify-between items-center border-b pb-2">
//                   <span className="font-semibold text-gray-500">{lbl}</span>
//                   <span className="font-bold">{val}</span>
//                 </div>
//               ))}

//               <div className="flex justify-between items-center border-b pb-2">
//                 <span className="font-semibold text-gray-500">Status Alarm</span>
//                 {buzzerPopup?.alarmActive ? (
//                   <Badge colorScheme="red" className="animate-pulse">
//                     🚨 ACTIVE
//                   </Badge>
//                 ) : (
//                   <Badge colorScheme="green">OK</Badge>
//                 )}
//               </div>

//               {/* Switch on/off
//               <div className="flex justify-between items-center pb-2">
//                 <span className="font-semibold text-gray-500">Buzzer Switch</span>
//                 <Stack direction="row" align="center" spacing={3}>
//                   <Text
//                     fontSize="sm"
//                     fontWeight="bold"
//                     color={editBuzzerOn ? "green.500" : "gray.500"}
//                   >
//                     {editBuzzerOn ? "ON" : "OFF"}
//                   </Text>
//                   <Switch
//                     colorScheme="green"
//                     isChecked={editBuzzerOn}
//                     isDisabled={!canWrite}
//                     onChange={(e) => setEditBuzzerOn(e.target.checked)}
//                   />
//                 </Stack>
//               </div> */}
//               {/* Switch on/off */}
//               <div className="flex justify-between items-center pb-2">
//                 <span className="font-semibold text-gray-500">Buzzer Switch</span>
//                 <Stack direction="row" align="center" spacing={3}>
//                   <Text
//                     fontSize="sm"
//                     fontWeight="bold"
//                     color={!editBuzzerOn ? "green.500" : "gray.500"}
//                   >
//                     {!editBuzzerOn ? "ON" : "OFF"}
//                   </Text>
//                   <Switch
//                     colorScheme="green"
//                     isChecked={!editBuzzerOn}
//                     isDisabled={!canWrite}
//                     onChange={(e) => setEditBuzzerOn(!e.target.checked)}
//                   />
//                 </Stack>
//               </div>

//               {!canWrite && (
//                 <Text fontSize="xs" color="red.400" textAlign="center">
//                   ⚠️ Level akses tidak mencukupi untuk ubah buzzer (butuh Level 3+)
//                 </Text>
//               )}
//             </Stack>
//           </ModalBody>

//           <ModalFooter>
//             <Button variant="ghost" mr={3} onClick={onBuzzerClose} isDisabled={savingBuzzer}>
//               Cancel
//             </Button>
//             <Button
//               colorScheme="blue"
//               onClick={handleSaveBuzzerToPlc}
//               isDisabled={!canWrite}
//               isLoading={savingBuzzer}
//               loadingText="Saving…"
//             >
//               Save to PLC
//             </Button>
//           </ModalFooter>
//         </ModalContent>
//       </Modal>
//     </div>
//   );
// }
import { useState, useEffect, useRef } from "react";
import {
  Text, Table, Thead, Tbody, Tr, Th, Td,
  TableContainer, Badge, Stack, Button, Input, Select,
  Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalCloseButton, ModalBody, ModalFooter,
  useDisclosure, useColorModeValue, useToast, Switch,
  Popover, PopoverTrigger, PopoverContent, PopoverArrow,
  PopoverCloseButton, PopoverHeader, PopoverBody,
  Checkbox, Tag, TagLabel, TagCloseButton, Wrap, WrapItem,
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
// Kustomisasi tampilan disimpan di localStorage — melekat ke browser
// yang dipakai (per laptop/PC), bukan ke user. Tetap ada walau
// browser ditutup & dibuka lagi; beda laptop otomatis beda isinya.
// ─────────────────────────────────────────────────────────────────
const LS_VIEW_MODE     = "scada_view_mode";
const LS_CUSTOM_ROOMS  = "scada_custom_rooms";
const LS_SELECTED_AHU  = "scada_selected_ahu";

const lsGet = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const lsSet = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage tidak tersedia (mis. private mode) — abaikan, fallback ke state saja
  }
};
const lsRemove = (key) => {
  try { localStorage.removeItem(key); } catch { /* no-op */ }
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
  const [selectedAhu, setSelectedAhu] = useState(() => lsGet(LS_SELECTED_AHU, null));

  // ── Kustomisasi tampilan (disimpan di localStorage browser ini) ──
  const [viewMode, setViewMode]       = useState(() => lsGet(LS_VIEW_MODE, "ahu")); // "ahu" | "custom"
  const [customRooms, setCustomRooms] = useState(() => lsGet(LS_CUSTOM_ROOMS, [])); // array nama ruangan
  const [roomSearch, setRoomSearch]   = useState("");

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

  // Ruangan yang tampil = rooms dari AHU yang sedang dipilih (mode "ahu")
  const currentAhu = ahuConfig.find((a) => a.ahu === selectedAhu);
  const ahuRooms   = currentAhu?.rooms ?? [];

  // Lookup ruangan → AHU asalnya (dipakai mode custom & logging)
  const roomToAhu = {};
  ahuConfig.forEach((a) => a.rooms.forEach((r) => { roomToAhu[r] = a.ahu; }));

  // Daftar ruangan custom, diurutkan mengikuti urutan AHU config
  const customRoomsSet    = new Set(customRooms);
  const orderedCustomRooms = ahuConfig.flatMap((a) => a.rooms.filter((r) => customRoomsSet.has(r)));

  // Ruangan yang benar-benar ditampilkan di tabel, tergantung mode
  const currentRooms = viewMode === "custom" ? orderedCustomRooms : ahuRooms;

  // ── Helper kustomisasi ruangan ──────────────────────────────────
  const toggleCustomRoom = (room) => {
    setCustomRooms((prev) =>
      prev.includes(room) ? prev.filter((r) => r !== room) : [...prev, room]
    );
  };
  const removeCustomRoom = (room) =>
    setCustomRooms((prev) => prev.filter((r) => r !== room));
  const clearCustomRooms = () => setCustomRooms([]);
  const selectAllFilteredRooms = () => {
    const q = roomSearch.trim().toLowerCase();
    const matches = ahuConfig.flatMap((a) => a.rooms.filter((r) => r.toLowerCase().includes(q)));
    setCustomRooms((prev) => Array.from(new Set([...prev, ...matches])));
  };
  const resetCustomization = () => {
    setViewMode("ahu");
    setCustomRooms([]);
    lsRemove(LS_CUSTOM_ROOMS);
    lsRemove(LS_VIEW_MODE);
  };

  // ── Simpan otomatis ke localStorage tiap ada perubahan ─────────
  useEffect(() => { lsSet(LS_VIEW_MODE, viewMode); }, [viewMode]);
  useEffect(() => { lsSet(LS_CUSTOM_ROOMS, customRooms); }, [customRooms]);
  useEffect(() => { if (selectedAhu) lsSet(LS_SELECTED_AHU, selectedAhu); }, [selectedAhu]);

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
          // Default pilih AHU pertama saat pertama kali terima config,
          // atau fallback kalau AHU yang tersimpan di localStorage
          // ternyata sudah tidak ada lagi di config terbaru
          setSelectedAhu((prev) => {
            const stillValid = payload.ahuConfig.some((a) => a.ahu === prev);
            return stillValid ? prev : (payload.ahuConfig[0]?.ahu ?? null);
          });
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
  useEffect(() => {
    if (!buzzerPopup) return;
    setEditBuzzerOn(buzzerPopup.switchOn === true);
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
      ahu:   roomToAhu[room] ?? selectedAhu,
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

    const { room, type, ahu } = popupData;
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
          ahu,
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
      ahu: roomToAhu[room] ?? selectedAhu,
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

    const { room, switchOn, ahu } = buzzerPopup;
    const t = getTagNames(room);

    // Kirim write command ke Node-RED → PLC (bit M, lihat vartable S7 Endpoint)
    wsRef.current.send(
      JSON.stringify({ cmd: "write", tag: t.BuzzerSwitch, value: editBuzzerOn })
    );

    // Catat audit log
    try {
      await logAuditAction("SCADA_EDIT_LIMIT", {
        ahu,
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

      {/* ── Mode tampilan: Per AHU / Kustomisasi (auto dari Node-RED config) ── */}
      {ahuConfig.length > 0 ? (
        <div className="mx-6 mb-4 flex flex-col gap-2">
          <div className="flex flex-wrap gap-3 items-center bg-card rounded-md shadow-lg p-3">
            <span className="font-semibold text-gray-500">Tampilan:</span>
            <Button
              size="sm"
              colorScheme={viewMode === "ahu" ? "blue" : "gray"}
              variant={viewMode === "ahu" ? "solid" : "outline"}
              onClick={() => setViewMode("ahu")}
            >
              All Ahu
            </Button>
            <Button
              size="sm"
              colorScheme={viewMode === "custom" ? "purple" : "gray"}
              variant={viewMode === "custom" ? "solid" : "outline"}
              onClick={() => setViewMode("custom")}
            >
              Custom Monitor
            </Button>

            {(viewMode === "custom" || customRooms.length > 0) && (
              <Button size="sm" variant="ghost" colorScheme="red" onClick={resetCustomization}>
                ↺ Reset Kustomisasi
              </Button>
            )}

            {viewMode === "ahu" ? (
              <>
                <span className="font-semibold text-gray-500 ml-2">AHU:</span>
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
                  <Badge colorScheme="blue">{ahuRooms.length} ruangan</Badge>
                  <Text fontSize="sm" fontWeight="medium">{selectedAhu}</Text>
                </div>
              </>
            ) : (
              <>
                <Popover placement="bottom-start" closeOnBlur>
                  <PopoverTrigger>
                    <Button size="sm" variant="outline" colorScheme="purple" ml={2}>
                       Select Room {customRooms.length > 0 ? ` (${customRooms.length})` : ""}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent width="320px">
                    <PopoverArrow />
                    <PopoverCloseButton />
                    <PopoverHeader fontWeight="semibold" fontSize="sm">
                      Select Room to Monitor
                    </PopoverHeader>
                    <PopoverBody maxH="360px" overflowY="auto">
                      <Input
                        size="sm"
                        placeholder="Cari ruangan…"
                        mb={2}
                        value={roomSearch}
                        onChange={(e) => setRoomSearch(e.target.value)}
                      />
                      <Stack direction="row" spacing={2} mb={3}>
                        <Button size="xs" colorScheme="purple" onClick={selectAllFilteredRooms}>
                          Pilih Semua
                        </Button>
                        <Button size="xs" variant="outline" onClick={clearCustomRooms}>
                          Hapus Semua
                        </Button>
                      </Stack>

                      {ahuConfig.map((a) => {
                        const q = roomSearch.trim().toLowerCase();
                        const filtered = q
                          ? a.rooms.filter((r) => r.toLowerCase().includes(q))
                          : a.rooms;
                        if (filtered.length === 0) return null;
                        return (
                          <div key={a.ahu} className="mb-3">
                            <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={1}>
                              {a.ahu}
                            </Text>
                            <Stack spacing={1}>
                              {filtered.map((room) => (
                                <Checkbox
                                  key={room}
                                  size="sm"
                                  isChecked={customRoomsSet.has(room)}
                                  onChange={() => toggleCustomRoom(room)}
                                >
                                  {room}
                                </Checkbox>
                              ))}
                            </Stack>
                          </div>
                        );
                      })}
                    </PopoverBody>
                  </PopoverContent>
                </Popover>
                <Badge colorScheme="purple">{customRooms.length} ruangan dipilih</Badge>
             
              </>
            )}
          </div>

          {/* Chip ruangan terpilih — mode custom */}
          {viewMode === "custom" && orderedCustomRooms.length > 0 && (
            <Wrap className="px-1">
              {orderedCustomRooms.map((room) => (
                <WrapItem key={room}>
                  <Tag size="sm" colorScheme="purple" borderRadius="full">
                    <TagLabel>
                      {room} <span className="opacity-60">· {roomToAhu[room]}</span>
                    </TagLabel>
                    <TagCloseButton onClick={() => removeCustomRoom(room)} />
                  </Tag>
                </WrapItem>
              ))}
            </Wrap>
          )}
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
      {currentRooms.length > 0 ? (
        <div className="mx-6 mb-4 bg-card rounded-md shadow-lg p-2">
          <TableContainer>
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th sx={tdS}>Ruangan (Station)</Th>
                  {viewMode === "custom" && <Th sx={tdS}>AHU</Th>}
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

                      {viewMode === "custom" && (
                        <Td sx={tdS}>
                          <Badge colorScheme="purple" fontSize="10px">
                            {roomToAhu[room] ?? "—"}
                          </Badge>
                        </Td>
                      )}

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
      ) : (
        ahuConfig.length > 0 &&
        viewMode === "custom" && (
          <div className="mx-6 mb-4 p-8 rounded-md border-2 border-dashed border-gray-300 text-center text-gray-400">
            <Text fontSize="sm" fontWeight="medium">No Selected</Text>
            <Text fontSize="xs" className="mt-1">
              Click  <strong> Select Room </strong> to Monitor
            </Text>
          </div>
        )
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
                ["AHU",       popupData?.ahu],
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
                ["AHU",     buzzerPopup?.ahu],
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

              {/* Switch on/off
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
              </div> */}
              {/* Switch on/off */}
              <div className="flex justify-between items-center pb-2">
                <span className="font-semibold text-gray-500">Buzzer Switch</span>
                <Stack direction="row" align="center" spacing={3}>
                  <Text
                    fontSize="sm"
                    fontWeight="bold"
                    color={!editBuzzerOn ? "green.500" : "gray.500"}
                  >
                    {!editBuzzerOn ? "ON" : "OFF"}
                  </Text>
                  <Switch
                    colorScheme="green"
                    isChecked={!editBuzzerOn}
                    isDisabled={!canWrite}
                    onChange={(e) => setEditBuzzerOn(!e.target.checked)}
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