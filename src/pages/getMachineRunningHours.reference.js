// ═══════════════════════════════════════════════════════════════════
// REFERENSI — bukan file asli. Aku belum punya databaseControllers.js
// kamu (bagian MACHINE), jadi ini rekonstruksi berdasarkan kontrak
// endpoint yang udah didokumentasikan di komentar header Machine.jsx:
//
//   GET /getMachineRunningHours?machine=&start=&finish=&flowCol=&threshold=
//       &shift1Start=&shift1End=&shift2Start=&shift2End=&shift3Start=&shift3End=
//
// Yang berubah dari versi lama: tiap baris `daily` dan `shiftDaily`
// sekarang juga bawa `segments` (array run/stop kontinu, lengkap sama
// jam mulai-selesai persis + offset buat di-plot). `runHours`/`stopHours`
// tetap ada supaya kartu Total Run/Stop/Uptime yang udah jalan nggak
// perlu diubah.
//
// SESUAIKAN dengan struktur asli kamu:
//   - MACHINE_CONFIG di bawah cuma contoh (table + nama kolom tanggal).
//     Kalau config mesin kamu udah ada di tempat lain (misal sama-sama
//     dipakai buat /getMachineConfig), reuse itu aja - jangan bikin dobel.
//   - Nama kolom value diasumsikan `data_format_<flowCol>`, ngikutin
//     pola cMT-C21B_FBD_GEA_data (data_format_0..7). Ganti kalau beda.
//   - Ganti `pool.query` sama koneksi MySQL yang kamu pakai.
// ═══════════════════════════════════════════════════════════════════

const moment = require("moment");

const MACHINE_CONFIG = {
  fbd_gea: { table: "cMT-C21B_FBD_GEA_data", dateCol: "waktu" },
  // ...mesin lain, atau reuse config yang udah ada
};

// Shift yang endTime <= startTime dianggap nyebrang tengah malam (mis. 22:00-06:00)
function parseShiftWindow(dateStr, startHHmm, endHHmm) {
  const start = moment(`${dateStr} ${startHHmm}`, "YYYY-MM-DD HH:mm");
  let end = moment(`${dateStr} ${endHHmm}`, "YYYY-MM-DD HH:mm");
  if (end.isSameOrBefore(start)) end.add(1, "day");
  return { start, end };
}

// Rows mentah (urut waktu, sudah difilter ke 1 window) -> segmen run/stop
// kontinu. offsetStart/offsetEnd = jam sejak windowStart (buat plotting,
// aman dari day-wrap); clockStart/clockEnd = jam asli (buat tooltip).
function toSegments(readings, windowStart, windowEnd) {
  const inWindow = readings.filter((r) => r.time.isBetween(windowStart, windowEnd, null, "[]"));
  if (!inWindow.length) return [];

  const raw = [];
  let cur = { state: inWindow[0].state, start: inWindow[0].time };
  for (let i = 1; i < inWindow.length; i++) {
    if (inWindow[i].state !== cur.state) {
      raw.push({ ...cur, end: inWindow[i].time });
      cur = { state: inWindow[i].state, start: inWindow[i].time };
    }
  }
  raw.push({ ...cur, end: inWindow[inWindow.length - 1].time });

  return raw.map((seg) => ({
    state: seg.state, // 'run' | 'stop'
    clockStart: seg.start.format("HH:mm"),
    clockEnd: seg.end.format("HH:mm"),
    offsetStart: +seg.start.diff(windowStart, "seconds") / 3600,
    offsetEnd: +seg.end.diff(windowStart, "seconds") / 3600,
  }));
}

function sumHours(segments, state) {
  return segments.filter((s) => s.state === state).reduce((sum, s) => sum + (s.offsetEnd - s.offsetStart), 0);
}

async function getMachineRunningHours(req, res) {
  const {
    machine, start, finish, flowCol, threshold,
    shift1Start, shift1End, shift2Start, shift2End, shift3Start, shift3End,
  } = req.query;

  const machineCfg = MACHINE_CONFIG[machine];
  if (!machineCfg) return res.status(400).json({ message: "Mesin tidak dikenal" });

  const valueCol = `data_format_${flowCol}`;
  const th = Number(threshold);

  try {
    const [rows] = await pool.query(
      `SELECT \`${machineCfg.dateCol}\` AS ts, \`${valueCol}\` AS val
       FROM \`${machineCfg.table}\`
       WHERE \`${machineCfg.dateCol}\` BETWEEN ? AND ?
       ORDER BY \`${machineCfg.dateCol}\` ASC`,
      [start, finish]
    );

    const readings = rows.map((r) => ({
      time: moment(r.ts),
      state: Number(r.val) > th ? "run" : "stop",
    }));

    const dayList = [];
    for (let d = moment(start).startOf("day"); d.isSameOrBefore(finish, "day"); d.add(1, "day")) {
      dayList.push(d.format("YYYY-MM-DD"));
    }

    const daily = dayList.map((date) => {
      const dayStart = moment(`${date} 00:00:00`);
      const dayEnd = moment(`${date} 23:59:59`);
      const segments = toSegments(readings, dayStart, dayEnd);
      return {
        date,
        runHours: +sumHours(segments, "run").toFixed(2),
        stopHours: +sumHours(segments, "stop").toFixed(2),
        segments,
      };
    });

    const shiftWindows = [
      { n: 1, s: shift1Start, e: shift1End },
      { n: 2, s: shift2Start, e: shift2End },
      { n: 3, s: shift3Start, e: shift3End },
    ];

    const shiftDaily = [];
    dayList.forEach((date) => {
      shiftWindows.forEach((sw) => {
        const { start: winStart, end: winEnd } = parseShiftWindow(date, sw.s, sw.e);
        const segments = toSegments(readings, winStart, winEnd);
        shiftDaily.push({
          date,
          shift: sw.n,
          runHours: +sumHours(segments, "run").toFixed(2),
          stopHours: +sumHours(segments, "stop").toFixed(2),
          segments,
        });
      });
    });

    // shiftSummary dipertahankan (agregat per nomor shift) buat kompatibilitas
    // kalau ada bagian lain yang masih makai; frontend hasil update di chat
    // udah nggak butuh ini lagi buat chart-nya.
    const shiftSummary = [1, 2, 3].map((n) => ({
      shift: n,
      runHours: +shiftDaily.filter((r) => r.shift === n).reduce((s, r) => s + r.runHours, 0).toFixed(2),
      stopHours: +shiftDaily.filter((r) => r.shift === n).reduce((s, r) => s + r.stopHours, 0).toFixed(2),
    }));

    res.json({ daily, shiftDaily, shiftSummary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal memuat running hours" });
  }
}

module.exports = { getMachineRunningHours };
