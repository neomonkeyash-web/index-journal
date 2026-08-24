import React, { useState, useEffect, useCallback, useRef } from "react";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const BLUE = "#1D1DE0";
const INK = "#111111";
const GRAY = "#9B9B95";
const LINE = "#DEDEDA";
const RED = "#C0261C";

const EASY_QUESTIONS = [
  { id: "when", label: "WHEN", hint: "朝、昼、夜——今はだいたい何時ごろ？" },
  { id: "where", label: "WHERE", hint: "部屋、電車の中、カフェ、外の空気——今どこにいる？" },
  { id: "who", label: "WITH WHO", hint: "ひとり、誰かと一緒——今そばにいるのは誰？" },
  { id: "what", label: "DOING", hint: "座ってる、歩いてる、作業中——今のからだの状態は？" },
  { id: "feel", label: "THINKING", hint: "どんな気分？　何か食べたいものある？　頭に浮かんでること" },
  { id: "next", label: "UP NEXT", hint: "次の予定、まだ決めてないこと、やりたいこと" },
];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function formatDateLabel(key) {
  const [y, m, d] = key.split("-").map(Number);
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${months[m - 1]} ${String(d).padStart(2, "0")}, ${y}`;
}

function formatNowStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

function buildEntryText(dateKey, data) {
  const lines = [`INDEX JOURNAL — ${formatDateLabel(dateKey)}`];
  if (data.hasEasy) {
    lines.push("");
    lines.push("EASY");
    EASY_QUESTIONS.forEach((q) => {
      const v = data.answers[q.id];
      if (v && v.trim()) lines.push(`${q.label}：${v.trim()}`);
    });
  }
  if (data.hasDeep) {
    lines.push("");
    lines.push("DEEP");
    ALPHABET.forEach((l) => {
      const v = data.letters[l];
      if (v && v.trim()) lines.push(`${l}｜${v.trim()}`);
    });
  }
  return lines.join("\n");
}

function buildICS(dateKey, text) {
  const dt = dateKey.replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = `${dt}-${Math.random().toString(36).slice(2)}@index-journal`;
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//INDEX JOURNAL//JP",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dt}`,
    `DTEND;VALUE=DATE:${dt}`,
    "SUMMARY:INDEX JOURNAL",
    `DESCRIPTION:${esc(text)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadICS(dateKey, text) {
  const ics = buildICS(dateKey, text);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `index-journal-${dateKey}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

async function shareNative(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text, title: "INDEX JOURNAL" });
      return true;
    } catch (e) {
      return false; // ユーザーがキャンセルした場合など
    }
  }
  copyToClipboard(text);
  alert("お使いの環境は共有シートに対応していないため、テキストをコピーしました。");
  return false;
}

function shareTwitter(text) {
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
}

function shareLine(text) {
  window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, "_blank");
}

async function shareInstagram(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text, title: "INDEX JOURNAL" });
      return;
    } catch (e) {
      /* キャンセルされた */
    }
  }
  copyToClipboard(text);
  alert("Instagramはリンクから直接投稿できないため、テキストをコピーしました。Instagramアプリを開いて貼り付けてください。");
}

/* ---------- ストレージアダプタ ----------
   window.storage（Claudeの永続保存）を試し、環境側の不具合で失敗した場合は
   メモリ内のMapに自動フォールバックする。フォールバック時はアプリを
   閉じるとデータが消えるため、UI側で「TEMP」表示を出す。 */
const memStore = new Map();
let memModeFlag = false;

async function storageSet(key, value, shared = false) {
  try {
    const r = await window.storage.set(key, value, shared);
    if (r) return { ok: true, mem: false };
    throw new Error("no result");
  } catch (e) {
    memStore.set(key, value);
    memModeFlag = true;
    return { ok: true, mem: true };
  }
}

async function storageGet(key, shared = false) {
  try {
    const r = await window.storage.get(key, shared);
    if (r && r.value) return r.value;
  } catch (e) {
    /* 実ストレージから読めなかった。メモリを見る */
  }
  return memStore.has(key) ? memStore.get(key) : null;
}

async function storageList(prefix, shared = false) {
  let keys = [];
  try {
    const r = await window.storage.list(prefix, shared);
    if (r && r.keys) keys = r.keys.slice();
  } catch (e) {
    /* 実ストレージが使えない */
  }
  for (const k of memStore.keys()) {
    if (k.startsWith(prefix) && !keys.includes(k)) keys.push(k);
  }
  return keys;
}

async function storageDelete(key, shared = false) {
  try {
    await window.storage.delete(key, shared);
  } catch (e) {
    /* 実ストレージ側は消せなかった（存在しない場合も） */
  }
  memStore.delete(key);
}

function emptyLetters() {
  const o = {};
  ALPHABET.forEach((l) => (o[l] = ""));
  return o;
}

function emptyAnswers() {
  const o = {};
  EASY_QUESTIONS.forEach((q) => (o[q.id] = ""));
  return o;
}

function useCountdown(totalSeconds, active) {
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  useEffect(() => {
    setSecondsLeft(totalSeconds);
  }, [totalSeconds, active]);
  useEffect(() => {
    if (!active) return;
    if (secondsLeft <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [active, secondsLeft > 0]);
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  return { secondsLeft, label: `${mm}:${ss}`, isDone: secondsLeft <= 0 };
}

// 写真を縮小してJPEGのdataURLにする（保存容量を抑えるため）
function resizeImage(file, maxDim = 600, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("image load failed"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

export default function IndexJournal() {
  const [view, setView] = useState("cover"); // cover | deep | easy | archive | detail
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [letters, setLetters] = useState(emptyLetters());
  const [answers, setAnswers] = useState(emptyAnswers());
  const [archiveList, setArchiveList] = useState([]);
  const [detailKey, setDetailKey] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [error, setError] = useState(null);
  const [memMode, setMemMode] = useState(false);
  const [profile, setProfile] = useState(null); // {clientId, nickname, room}
  const [roomFeed, setRoomFeed] = useState([]);
  const [detailBack, setDetailBack] = useState("archive");
  const [detailNickname, setDetailNickname] = useState(null);
  const [photos, setPhotos] = useState({}); // {A: dataURL, ...}
  const [detailPhotos, setDetailPhotos] = useState({});
  const saveTimer = useRef(null);
  const key = `ij:entry:${selectedDate}`;

  // プロフィール（ニックネーム＋ルーム）を読み込む
  useEffect(() => {
    (async () => {
      try {
        const v = await storageGet("ij:profile", false);
        if (v) setProfile(JSON.parse(v));
      } catch (e) {
        /* プロフィール未作成 */
      }
    })();
  }, []);

  const loadPhotos = useCallback(async (dateKey) => {
    const prefix = `ij:photo:${dateKey}:`;
    const result = {};
    try {
      const keys = await storageList(prefix, false);
      for (const k of keys) {
        try {
          const v = await storageGet(k, false);
          if (v) result[k.slice(prefix.length)] = v;
        } catch (e) {}
      }
    } catch (e) {}
    return result;
  }, []);

  const loadToday = useCallback(async () => {
    try {
      const value = await storageGet(key);
      if (value) {
        const parsed = JSON.parse(value);
        // 旧フォーマット（letters が直下）にも対応
        const deep = parsed.deep || (parsed.letters ? { letters: parsed.letters } : null);
        const easy = parsed.easy || null;
        setLetters({ ...emptyLetters(), ...(deep ? deep.letters : {}) });
        setAnswers({ ...emptyAnswers(), ...(easy ? easy.answers : {}) });
      } else {
        setLetters(emptyLetters());
        setAnswers(emptyAnswers());
      }
    } catch (e) {
      setLetters(emptyLetters());
      setAnswers(emptyAnswers());
    }
    setPhotos(await loadPhotos(selectedDate));
  }, [key, selectedDate, loadPhotos]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const saveNow = useCallback(
    async (nextDeepLetters, nextEasyAnswers) => {
      try {
        const payload = JSON.stringify({
          deep: { letters: nextDeepLetters !== undefined ? nextDeepLetters : letters },
          easy: { answers: nextEasyAnswers !== undefined ? nextEasyAnswers : answers },
          updatedAt: new Date().toISOString(),
        });
        const result = await storageSet(key, payload);
        if (!result.ok) {
          setError("SAVE FAILED");
          return false;
        }
        setMemMode(result.mem);
        setError(null);
        return true;
      } catch (e) {
        setError(`SAVE FAILED: ${e && e.message ? e.message : String(e)}`);
        return false;
      }
    },
    [key, letters, answers]
  );

  const persist = useCallback(
    (nextDeepLetters, nextEasyAnswers) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveNow(nextDeepLetters, nextEasyAnswers);
      }, 400);
    },
    [saveNow]
  );

  // FINISHを押したとき：保留中の自動保存タイマーを止めて、
  // 今の状態を確実に保存してからアーカイブを開く。
  // 保存に失敗した場合はアーカイブへ移動せず、エラーをその場で表示する。
  const finishAndArchive = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const ok = await saveNow();
    if (!ok) return;
    await loadArchive();
  }, [saveNow]);

  const handleLetterChange = (letter, value) => {
    const next = { ...letters, [letter]: value };
    setLetters(next);
    persist(next, undefined);
  };

  const handlePhotoSelect = async (letter, file) => {
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      setPhotos((prev) => ({ ...prev, [letter]: dataUrl }));
      const r = await storageSet(`ij:photo:${selectedDate}:${letter}`, dataUrl, false);
      setMemMode(r.mem);
    } catch (e) {
      setError("PHOTO FAILED");
    }
  };

  const handlePhotoRemove = async (letter) => {
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[letter];
      return next;
    });
    await storageDelete(`ij:photo:${selectedDate}:${letter}`, false);
  };

  const handleAnswerChange = (id, value) => {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    persist(undefined, next);
  };

  const deepFilledCount = ALPHABET.filter((l) => letters[l].trim().length > 0).length;
  const easyFilledCount = EASY_QUESTIONS.filter((q) => answers[q.id].trim().length > 0).length;

  const loadArchive = async () => {
    try {
      const keys = (await storageList("ij:entry:")).slice();
      keys.sort().reverse();
      const items = [];
      for (const k of keys) {
        try {
          const value = await storageGet(k);
          if (value) {
            const parsed = JSON.parse(value);
            const dateKey = k.replace("ij:entry:", "");
            const deep = parsed.deep || (parsed.letters ? { letters: parsed.letters } : null);
            const easy = parsed.easy || null;
            const deepCount = deep ? ALPHABET.filter((l) => (deep.letters?.[l] || "").trim()).length : 0;
            const easyCount = easy ? EASY_QUESTIONS.filter((q) => (easy.answers?.[q.id] || "").trim()).length : 0;
            items.push({ dateKey, deepCount, easyCount });
          }
        } catch (e) {
          // このキーだけ読めなかった。他のキーの読み込みは続ける
        }
      }
      setArchiveList(items);
      setError(null);
      setView("archive");
    } catch (e) {
      setError(`COULD NOT LOAD ARCHIVE: ${e && e.message ? e.message : String(e)}`);
      setArchiveList([]);
      setView("archive");
    }
  };

  const openDetail = async (dateKey) => {
    try {
      const value = await storageGet(`ij:entry:${dateKey}`);
      if (value) {
        const parsed = JSON.parse(value);
        const deep = parsed.deep || (parsed.letters ? { letters: parsed.letters } : null);
        const easy = parsed.easy || null;
        setDetailData({
          letters: { ...emptyLetters(), ...(deep ? deep.letters : {}) },
          answers: { ...emptyAnswers(), ...(easy ? easy.answers : {}) },
          hasDeep: !!deep,
          hasEasy: !!easy,
        });
        setDetailKey(dateKey);
        setDetailNickname(null);
        setDetailBack("archive");
        setDetailPhotos(await loadPhotos(dateKey));
        setView("detail");
      }
    } catch (e) {
      setError("COULD NOT OPEN");
    }
  };

  const deleteEntry = async (dateKey, ev) => {
    ev.stopPropagation();
    try {
      await storageDelete(`ij:entry:${dateKey}`);
      setArchiveList((prev) => prev.filter((i) => i.dateKey !== dateKey));
    } catch (e) {
      setError("COULD NOT DELETE");
    }
  };

  /* ---------- ルーム（合言葉で友達と見せ合う） ---------- */

  const joinRoom = async (nickname, code) => {
    const room = code.replace(/[\s/\\'"]/g, "");
    const nick = nickname.trim() || "ANON";
    if (!room) return;
    const clientId =
      (profile && profile.clientId) ||
      ((crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random());
    const p = { clientId, nickname: nick, room };
    setProfile(p);
    await storageSet("ij:profile", JSON.stringify(p), false);
    await loadRoom(p);
  };

  const leaveRoom = async () => {
    if (!profile) return;
    const p = { ...profile, room: null };
    setProfile(p);
    await storageSet("ij:profile", JSON.stringify(p), false);
    setView("cover");
  };

  const loadRoom = async (p) => {
    const prof = p || profile;
    if (!prof || !prof.room) {
      setView("room");
      return;
    }
    try {
      const prefix = `ijroom:${prof.room}:`;
      const keys = await storageList(prefix, true);
      const items = [];
      for (const k of keys) {
        try {
          const v = await storageGet(k, true);
          if (!v) continue;
          const parsed = JSON.parse(v);
          const rest = k.slice(prefix.length); // "{date}:{clientId}"
          const dateKey = rest.slice(0, 10);
          const cid = rest.slice(11);
          const deep = parsed.deep || null;
          const easy = parsed.easy || null;
          const deepCount = deep ? ALPHABET.filter((l) => (deep.letters?.[l] || "").trim()).length : 0;
          const easyCount = easy ? EASY_QUESTIONS.filter((q) => (easy.answers?.[q.id] || "").trim()).length : 0;
          items.push({ k, dateKey, clientId: cid, nickname: parsed.nickname || "ANON", deepCount, easyCount });
        } catch (e) {
          /* この投稿だけ読めなかった */
        }
      }
      items.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
      setRoomFeed(items);
    } catch (e) {
      setRoomFeed([]);
    }
    setView("room");
  };

  const openRoomDetail = async (item) => {
    try {
      const v = await storageGet(item.k, true);
      if (!v) return;
      const parsed = JSON.parse(v);
      const deep = parsed.deep || null;
      const easy = parsed.easy || null;
      setDetailData({
        letters: { ...emptyLetters(), ...(deep ? deep.letters : {}) },
        answers: { ...emptyAnswers(), ...(easy ? easy.answers : {}) },
        hasDeep: !!deep,
        hasEasy: !!easy,
      });
      setDetailKey(item.dateKey);
      setDetailNickname(item.nickname);
      setDetailBack("room");
      setView("detail");
    } catch (e) {
      setError("COULD NOT OPEN");
    }
  };

  // 自分のアーカイブの記録をルームに公開する
  const publishToRoom = async (dateKey, data) => {
    if (!profile || !profile.room) return false;
    const payload = JSON.stringify({
      nickname: profile.nickname,
      deep: data.hasDeep ? { letters: data.letters } : null,
      easy: data.hasEasy ? { answers: data.answers } : null,
      updatedAt: new Date().toISOString(),
    });
    const r = await storageSet(`ijroom:${profile.room}:${dateKey}:${profile.clientId}`, payload, true);
    return r.ok;
  };

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "#FFFFFF", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
    >
      <style>{`
        input::placeholder { color: #C7C7C2; }
        input:focus { outline: none; }
        * { box-sizing: border-box; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      {view === "cover" && (
        <CoverView
          selectedDate={selectedDate}
          onChangeDate={setSelectedDate}
          onStartEasy={() => { loadToday(); setView("easy"); }}
          onStartDeep={() => { loadToday(); setView("deep"); }}
          onArchive={loadArchive}
          onRoom={() => loadRoom()}
          roomName={profile && profile.room ? profile.room : null}
        />
      )}

      {view === "deep" && (
        <DeepEntryView
          dateKey={selectedDate}
          letters={letters}
          photos={photos}
          onChange={handleLetterChange}
          onPhotoSelect={handlePhotoSelect}
          onPhotoRemove={handlePhotoRemove}
          filledCount={deepFilledCount}
          error={error}
          memMode={memMode}
          onBack={() => setView("cover")}
          onFinish={finishAndArchive}
        />
      )}

      {view === "easy" && (
        <EasyEntryView
          dateKey={selectedDate}
          answers={answers}
          onChange={handleAnswerChange}
          filledCount={easyFilledCount}
          error={error}
          memMode={memMode}
          onBack={() => setView("cover")}
          onFinish={finishAndArchive}
        />
      )}

      {view === "archive" && (
        <ArchiveView items={archiveList} error={error} onBack={() => setView("cover")} onOpen={openDetail} onDelete={deleteEntry} />
      )}

      {view === "room" && (
        <RoomView
          profile={profile}
          feed={roomFeed}
          memMode={memMode}
          onBack={() => setView("cover")}
          onJoin={joinRoom}
          onLeave={leaveRoom}
          onOpen={openRoomDetail}
          onReload={() => loadRoom()}
        />
      )}

      {view === "detail" && detailData && (
        <DetailView
          dateKey={detailKey}
          data={detailData}
          photos={detailBack === "archive" ? detailPhotos : {}}
          nickname={detailNickname}
          backLabel={detailBack === "room" ? "← ROOM" : "← ARCHIVE"}
          onBack={() => setView(detailBack)}
          onPublish={
            detailBack === "archive" && profile && profile.room
              ? () => publishToRoom(detailKey, detailData)
              : null
          }
          roomName={profile && profile.room ? profile.room : null}
        />
      )}
    </div>
  );
}

/* ---------- COVER ---------- */
function CoverView({ selectedDate, onChangeDate, onStartEasy, onStartDeep, onArchive, onRoom, roomName }) {
  const isToday = selectedDate === todayKey();
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 md:px-10 pt-6" style={{ borderBottom: `1px solid ${LINE}` }}>
        <span className="text-xs tracking-[0.2em] pb-4" style={{ color: GRAY }}>TWO WAYS IN</span>
        <span className="text-xs tracking-[0.2em] pb-4" style={{ color: GRAY }}>002</span>
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 md:px-10">
        <h1 className="font-bold leading-[0.85]" style={{ color: INK, fontSize: "clamp(3.5rem, 14vw, 9rem)", letterSpacing: "-0.03em" }}>
          index<br />journal
        </h1>
      </div>

      <div className="px-6 md:px-10 pb-10" style={{ borderTop: `1px solid ${LINE}` }}>
        <div className="pt-5 flex items-center justify-between gap-3">
          <span className="text-xs tracking-[0.15em]" style={{ color: GRAY }}>
            {isToday ? "TODAY" : "BACKFILL"}
          </span>
          <input
            type="date"
            value={selectedDate}
            max={todayKey()}
            onChange={(e) => e.target.value && onChangeDate(e.target.value)}
            className="text-xs tracking-[0.05em] px-2 py-1 bg-transparent"
            style={{ color: INK, border: `1px solid ${LINE}` }}
          />
        </div>

        <div className="pt-4 flex flex-col sm:flex-row gap-3">
          <button
            onClick={onStartEasy}
            className="flex-1 flex items-center justify-between px-6 py-4 hover:opacity-80 transition-opacity text-left"
            style={{ border: `1px solid ${INK}`, color: INK }}
          >
            <span className="text-sm tracking-[0.15em] font-bold">EASY</span>
            <span className="text-xs" style={{ color: GRAY }}>5 MIN · 6問</span>
          </button>
          <button
            onClick={onStartDeep}
            className="flex-1 flex items-center justify-between px-6 py-4 hover:opacity-80 transition-opacity text-left"
            style={{ background: INK, color: "#FFFFFF" }}
          >
            <span className="text-sm tracking-[0.15em] font-bold">DEEP</span>
            <span className="text-xs" style={{ color: "#C7C7C2" }}>10 MIN · A—Z</span>
          </button>
        </div>
        <button onClick={onArchive} className="mt-5 mr-5 text-xs tracking-[0.15em] hover:opacity-60 transition-opacity" style={{ color: INK }}>
          ARCHIVE →
        </button>
        <button onClick={onRoom} className="mt-5 text-xs tracking-[0.15em] hover:opacity-60 transition-opacity" style={{ color: roomName ? BLUE : INK }}>
          {roomName ? `ROOM: ${roomName} →` : "ROOM →"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Timer bar (shared) ---------- */
function TimerBar({ label, isDone }) {
  return (
    <span className="text-xs tracking-[0.15em]" style={{ color: isDone ? BLUE : GRAY, fontVariantNumeric: "tabular-nums" }}>
      {isDone ? "TIME'S UP" : label}
    </span>
  );
}

/* ---------- DEEP ENTRY (A-Z, 10min) ---------- */
function DeepEntryView({ dateKey, letters, photos, onChange, onPhotoSelect, onPhotoRemove, filledCount, error, memMode, onBack, onFinish }) {
  const { label, isDone } = useCountdown(10 * 60, true);
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 md:px-10 py-4 sticky top-0 bg-white z-10" style={{ borderBottom: `1px solid ${LINE}` }}>
        <button onClick={onBack} className="text-xs tracking-[0.15em] hover:opacity-60 transition-opacity" style={{ color: INK }}>← BACK</button>
        <TimerBar label={label} isDone={isDone} />
        <span className="text-xs tracking-[0.15em]" style={{ color: filledCount > 0 ? BLUE : GRAY }}>
          {String(filledCount).padStart(2, "0")} / 26
        </span>
      </div>
      <p className="text-xs tracking-[0.15em] px-6 md:px-10 pt-3" style={{ color: GRAY }}>{formatDateLabel(dateKey)}</p>


      <div className="flex-1 max-w-2xl w-full mx-auto px-6 md:px-10">
        {ALPHABET.map((letter, i) => {
          const filled = letters[letter].trim().length > 0;
          const photo = photos[letter];
          return (
            <div key={letter} className="py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
              <div className="flex items-center gap-4 md:gap-6">
                <span className="text-xs w-6 shrink-0" style={{ color: GRAY, fontVariantNumeric: "tabular-nums" }}>
                  {String(i).padStart(2, "0")}
                </span>
                <span className="font-bold w-6 shrink-0 text-xl" style={{ color: filled ? BLUE : INK }}>{letter}</span>
                <input
                  type="text"
                  value={letters[letter]}
                  onChange={(e) => onChange(letter, e.target.value)}
                  placeholder="—"
                  className="flex-1 text-base md:text-lg bg-transparent py-1"
                  style={{ color: INK }}
                />
                <label
                  className="shrink-0 px-2 py-1 text-xs tracking-[0.05em] cursor-pointer hover:opacity-70 transition-opacity"
                  style={{ border: `1px solid ${photo ? BLUE : GRAY}`, color: photo ? BLUE : GRAY }}
                >
                  {photo ? "PHOTO" : "+ IMG"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      onPhotoSelect(letter, e.target.files && e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {photo && (
                <div className="flex items-start gap-3 mt-2 ml-10 md:ml-12">
                  <img
                    src={photo}
                    alt={letter}
                    className="h-20 w-20 object-cover"
                    style={{ border: `1px solid ${LINE}` }}
                  />
                  <button
                    onClick={() => onPhotoRemove(letter)}
                    className="text-xs tracking-[0.1em] px-2 py-1 hover:opacity-60"
                    style={{ color: RED }}
                  >
                    REMOVE
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-6 md:px-10 py-6 flex items-center justify-between sticky bottom-0 bg-white" style={{ borderTop: `1px solid ${LINE}` }}>
        <span className="text-xs tracking-[0.15em]" style={{ color: error ? RED : memMode ? BLUE : GRAY }}>
          {error || (memMode ? "TEMP SAVED（閉じると消えます）" : "AUTO-SAVED")}
        </span>
        <button onClick={onFinish} className="px-7 py-3 text-sm tracking-[0.15em] hover:opacity-80 transition-opacity" style={{ background: BLUE, color: "#FFFFFF" }}>
          FINISH
        </button>
      </div>
    </div>
  );
}

/* ---------- EASY ENTRY (5W1H, 5min) ---------- */
function EasyEntryView({ dateKey, answers, onChange, filledCount, error, memMode, onBack, onFinish }) {
  const { label, isDone } = useCountdown(5 * 60, true);
  const [openHint, setOpenHint] = useState(null);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 md:px-10 py-4 sticky top-0 bg-white z-10" style={{ borderBottom: `1px solid ${LINE}` }}>
        <button onClick={onBack} className="text-xs tracking-[0.15em] hover:opacity-60 transition-opacity" style={{ color: INK }}>← BACK</button>
        <TimerBar label={label} isDone={isDone} />
        <span className="text-xs tracking-[0.15em]" style={{ color: filledCount > 0 ? BLUE : GRAY }}>
          {String(filledCount).padStart(2, "0")} / {EASY_QUESTIONS.length}
        </span>
      </div>
      <p className="text-xs tracking-[0.15em] px-6 md:px-10 pt-3" style={{ color: GRAY }}>{formatDateLabel(dateKey)}</p>

      <div className="flex-1 max-w-2xl w-full mx-auto px-6 md:px-10">
        {EASY_QUESTIONS.map((q, i) => {
          const filled = answers[q.id].trim().length > 0;
          const hintOpen = openHint === q.id;
          return (
            <div key={q.id} className="py-4" style={{ borderBottom: `1px solid ${LINE}` }}>
              <div className="flex items-center gap-4 md:gap-6">
                <span className="text-xs w-6 shrink-0" style={{ color: GRAY, fontVariantNumeric: "tabular-nums" }}>
                  {String(i).padStart(2, "0")}
                </span>
                <span className="font-bold shrink-0 text-base md:text-lg w-28 md:w-32" style={{ color: filled ? BLUE : INK }}>
                  {q.label}
                </span>
                <input
                  type="text"
                  value={answers[q.id]}
                  onChange={(e) => onChange(q.id, e.target.value)}
                  placeholder="—"
                  className="flex-1 text-base md:text-lg bg-transparent py-1"
                  style={{ color: INK }}
                />
                {q.id === "when" && (
                  <button
                    onClick={() => onChange(q.id, formatNowStamp())}
                    className="shrink-0 text-xs px-2 py-1 hover:opacity-70 transition-opacity"
                    style={{ border: `1px solid ${BLUE}`, color: BLUE }}
                  >
                    NOW
                  </button>
                )}
                <button
                  onClick={() => setOpenHint(hintOpen ? null : q.id)}
                  className="shrink-0 w-6 h-6 rounded-full text-xs flex items-center justify-center hover:opacity-70 transition-opacity"
                  style={{ border: `1px solid ${GRAY}`, color: GRAY }}
                >
                  ?
                </button>
              </div>
              {hintOpen && (
                <p className="mt-2 ml-10 md:ml-12 text-xs" style={{ color: GRAY }}>
                  {q.hint}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-6 md:px-10 py-6 flex items-center justify-between sticky bottom-0 bg-white" style={{ borderTop: `1px solid ${LINE}` }}>
        <span className="text-xs tracking-[0.15em]" style={{ color: error ? RED : memMode ? BLUE : GRAY }}>
          {error || (memMode ? "TEMP SAVED（閉じると消えます）" : "AUTO-SAVED")}
        </span>
        <button onClick={onFinish} className="px-7 py-3 text-sm tracking-[0.15em] hover:opacity-80 transition-opacity" style={{ background: BLUE, color: "#FFFFFF" }}>
          FINISH
        </button>
      </div>
    </div>
  );
}

/* ---------- ARCHIVE ---------- */
function ArchiveView({ items, error, onBack, onOpen, onDelete }) {
  const [pendingDelete, setPendingDelete] = useState(null);
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 md:px-10 py-4" style={{ borderBottom: `1px solid ${LINE}` }}>
        <button onClick={onBack} className="text-xs tracking-[0.15em] hover:opacity-60 transition-opacity" style={{ color: INK }}>← BACK</button>
        <span className="text-xs tracking-[0.15em]" style={{ color: GRAY }}>ARCHIVE</span>
        <span className="text-xs tracking-[0.15em]" style={{ color: GRAY }}>{String(items.length).padStart(2, "0")}</span>
      </div>

      <div className="flex-1 max-w-2xl w-full mx-auto px-6 md:px-10 py-4">
        {error && (
          <p className="text-xs py-3 break-all" style={{ color: RED }}>{error}</p>
        )}
        {items.length === 0 ? (
          <p className="text-sm py-16 text-center" style={{ color: GRAY }}>NO RECORDS YET</p>
        ) : (
          items.map((item, i) => (
            <button
              key={item.dateKey}
              onClick={() => onOpen(item.dateKey)}
              className="w-full flex items-center justify-between gap-3 py-4 text-left hover:opacity-60 transition-opacity"
              style={{ borderBottom: `1px solid ${LINE}` }}
            >
              <span className="text-xs w-6 shrink-0" style={{ color: GRAY }}>{String(i).padStart(2, "0")}</span>
              <span className="flex-1 text-base font-bold" style={{ color: INK }}>{formatDateLabel(item.dateKey)}</span>
              {item.easyCount > 0 && (
                <span className="text-xs" style={{ color: BLUE }}>EASY {item.easyCount}/{EASY_QUESTIONS.length}</span>
              )}
              {item.deepCount > 0 && (
                <span className="text-xs" style={{ color: BLUE }}>DEEP {item.deepCount}/26</span>
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (pendingDelete === item.dateKey) {
                    setPendingDelete(null);
                    onDelete(item.dateKey, e);
                  } else {
                    setPendingDelete(item.dateKey);
                  }
                }}
                className="text-xs tracking-[0.1em] px-2 py-1 hover:opacity-60"
                style={{ color: RED, fontWeight: pendingDelete === item.dateKey ? 700 : 400 }}
              >
                {pendingDelete === item.dateKey ? "SURE?" : "DEL"}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- ROOM（合言葉で友達と見せ合う） ---------- */
function RoomView({ profile, feed, memMode, onBack, onJoin, onLeave, onOpen, onReload }) {
  const [nick, setNick] = useState(profile && profile.nickname ? profile.nickname : "");
  const [code, setCode] = useState("");
  const joined = profile && profile.room;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 md:px-10 py-4" style={{ borderBottom: `1px solid ${LINE}` }}>
        <button onClick={onBack} className="text-xs tracking-[0.15em] hover:opacity-60 transition-opacity" style={{ color: INK }}>← BACK</button>
        <span className="text-xs tracking-[0.15em]" style={{ color: GRAY }}>ROOM</span>
        <span className="text-xs tracking-[0.15em]" style={{ color: joined ? BLUE : GRAY }}>
          {joined ? profile.room : "—"}
        </span>
      </div>

      <div className="flex-1 max-w-2xl w-full mx-auto px-6 md:px-10 py-6">
        {!joined ? (
          <div>
            <p className="text-sm pb-6" style={{ color: INK }}>
              合言葉を決めて、友達と同じ言葉を入力すると、お互いが「公開」した記録を見せ合えます。
            </p>
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs tracking-[0.15em] pb-1" style={{ color: GRAY }}>NICKNAME</p>
                <input
                  type="text"
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                  placeholder="ニックネーム"
                  className="w-full text-base py-2 bg-transparent border-b"
                  style={{ color: INK, borderColor: LINE }}
                />
              </div>
              <div>
                <p className="text-xs tracking-[0.15em] pb-1" style={{ color: GRAY }}>ROOM CODE（合言葉）</p>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="例：sakusaku2026"
                  className="w-full text-base py-2 bg-transparent border-b"
                  style={{ color: INK, borderColor: LINE }}
                />
              </div>
              <button
                onClick={() => onJoin(nick, code)}
                disabled={!code.replace(/[\s/\\'"]/g, "")}
                className="mt-2 px-7 py-3 text-sm tracking-[0.15em] hover:opacity-80 transition-opacity self-start disabled:opacity-30"
                style={{ background: BLUE, color: "#FFFFFF" }}
              >
                JOIN
              </button>
              <p className="text-xs pt-2" style={{ color: GRAY }}>
                合言葉は鍵ではなく「待ち合わせ場所」です。推測されにくい言葉にしてください。
              </p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between pb-4" style={{ borderBottom: `1px solid ${LINE}` }}>
              <span className="text-xs tracking-[0.15em]" style={{ color: GRAY }}>
                {profile.nickname} としてルームに参加中
              </span>
              <div className="flex gap-3">
                <button onClick={onReload} className="text-xs tracking-[0.1em] hover:opacity-60" style={{ color: BLUE }}>
                  RELOAD
                </button>
                <button onClick={onLeave} className="text-xs tracking-[0.1em] hover:opacity-60" style={{ color: RED }}>
                  LEAVE
                </button>
              </div>
            </div>

            {memMode && (
              <p className="text-xs py-3" style={{ color: BLUE }}>
                いまは一時保存モードのため、他の人の記録とはまだ繋がりません（公開版で有効になります）。
              </p>
            )}

            {feed.length === 0 ? (
              <p className="text-sm py-16 text-center" style={{ color: GRAY }}>
                まだ誰も公開していません。ARCHIVEから記録を開いて「TO ROOM」で公開できます。
              </p>
            ) : (
              feed.map((item, i) => (
                <button
                  key={item.k}
                  onClick={() => onOpen(item)}
                  className="w-full flex items-center justify-between gap-3 py-4 text-left hover:opacity-60 transition-opacity"
                  style={{ borderBottom: `1px solid ${LINE}` }}
                >
                  <span className="text-xs w-6 shrink-0" style={{ color: GRAY }}>{String(i).padStart(2, "0")}</span>
                  <span className="shrink-0 text-sm font-bold" style={{ color: BLUE }}>{item.nickname}</span>
                  <span className="flex-1 text-sm" style={{ color: INK }}>{formatDateLabel(item.dateKey)}</span>
                  {item.easyCount > 0 && (
                    <span className="text-xs" style={{ color: GRAY }}>EASY {item.easyCount}/{EASY_QUESTIONS.length}</span>
                  )}
                  {item.deepCount > 0 && (
                    <span className="text-xs" style={{ color: GRAY }}>DEEP {item.deepCount}/26</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- DETAIL (read-only) ---------- */
function DetailView({ dateKey, data, photos = {}, nickname, backLabel, onBack, onPublish, roomName }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 md:px-10 py-4" style={{ borderBottom: `1px solid ${LINE}` }}>
        <button onClick={onBack} className="text-xs tracking-[0.15em] hover:opacity-60 transition-opacity" style={{ color: INK }}>
          {backLabel || "← ARCHIVE"}
        </button>
        <span className="text-xs tracking-[0.15em]" style={{ color: GRAY }}>
          {nickname ? `${nickname} · ` : ""}{formatDateLabel(dateKey)}
        </span>
        <span />
      </div>

      <div className="flex-1 max-w-2xl w-full mx-auto px-6 md:px-10 pb-10">
        {data.hasEasy && (
          <>
            <p className="text-xs tracking-[0.15em] pt-6 pb-2" style={{ color: GRAY }}>EASY</p>
            {EASY_QUESTIONS.map((q, i) => {
              const val = data.answers[q.id];
              const filled = val && val.trim().length > 0;
              return (
                <div key={q.id} className="flex items-center gap-4 md:gap-6 py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
                  <span className="text-xs w-6 shrink-0" style={{ color: GRAY }}>{String(i).padStart(2, "0")}</span>
                  <span className="font-bold shrink-0 text-base w-28 md:w-32" style={{ color: filled ? BLUE : GRAY }}>{q.label}</span>
                  <span className="flex-1 text-base" style={{ color: filled ? INK : "#C7C7C2" }}>{filled ? val : "—"}</span>
                </div>
              );
            })}
          </>
        )}

        {data.hasDeep && (
          <>
            <p className="text-xs tracking-[0.15em] pt-8 pb-2" style={{ color: GRAY }}>DEEP</p>
            {ALPHABET.map((letter, i) => {
              const val = data.letters[letter];
              const filled = val && val.trim().length > 0;
              const photo = photos[letter];
              return (
                <div key={letter} className="py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
                  <div className="flex items-center gap-4 md:gap-6">
                    <span className="text-xs w-6 shrink-0" style={{ color: GRAY, fontVariantNumeric: "tabular-nums" }}>{String(i).padStart(2, "0")}</span>
                    <span className="font-bold w-6 shrink-0 text-xl" style={{ color: filled ? BLUE : GRAY }}>{letter}</span>
                    <span className="flex-1 text-base md:text-lg" style={{ color: filled ? INK : "#C7C7C2" }}>{filled ? val : "—"}</span>
                  </div>
                  {photo && (
                    <img
                      src={photo}
                      alt={letter}
                      className="mt-2 ml-10 md:ml-12 max-h-48 object-cover"
                      style={{ border: `1px solid ${LINE}` }}
                    />
                  )}
                </div>
              );
            })}
          </>
        )}

        {!data.hasEasy && !data.hasDeep && (
          <p className="text-sm py-16 text-center" style={{ color: GRAY }}>NO DATA</p>
        )}

        {(data.hasEasy || data.hasDeep) && (
          <ShareBar dateKey={dateKey} data={data} onPublish={onPublish} roomName={roomName} />
        )}
      </div>
    </div>
  );
}

/* ---------- SHARE ---------- */
function ShareBar({ dateKey, data, onPublish, roomName }) {
  const text = buildEntryText(dateKey, data);
  const [note, setNote] = useState(null);

  const handlePublish = async () => {
    if (!onPublish) return;
    const ok = await onPublish();
    setNote(
      ok
        ? `ルーム「${roomName}」に公開しました。合言葉を知っている友達から見えるようになります。`
        : "ルームへの公開に失敗しました。"
    );
  };

  const [showText, setShowText] = useState(false);

  const handleShare = async () => {
    // 1. 端末の共有シート（対応していれば開く）
    if (navigator.share) {
      try {
        await navigator.share({ text, title: "INDEX JOURNAL" });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // ユーザーがキャンセル
        // ブロックされた場合は次の手段へ
      }
    }
    // 2. クリップボードにコピー
    try {
      await navigator.clipboard.writeText(text);
      setNote("共有画面が開けない環境のため、テキストをコピーしました。LINEやXなどに貼り付けてください。");
      setShowText(false);
      return;
    } catch (e) {
      // コピーもブロックされた場合は最終手段へ
    }
    // 3. テキストを直接表示して手動コピーしてもらう
    setShowText(true);
    setNote("下のテキストを長押しして、手動でコピーしてください。");
  };

  const handleCalendar = () => {
    try {
      downloadICS(dateKey, text);
      setNote(
        "カレンダーファイル（.ics）を書き出しました。ダウンロードが始まらない場合はClaude内プレビューの制限です（公開版では動作します）。"
      );
    } catch (e) {
      setShowText(true);
      setNote("この環境ではファイル書き出しがブロックされています。下のテキストをコピーしてカレンダーのメモに貼り付けてください。");
    }
  };

  return (
    <div className="pt-8 pb-10" style={{ borderTop: `1px solid ${LINE}` }}>
      <p className="text-xs tracking-[0.15em] pt-6 pb-3" style={{ color: GRAY }}>SHARE</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleShare}
          className="px-6 py-3 text-sm tracking-[0.15em] hover:opacity-80 transition-opacity"
          style={{ background: INK, color: "#FFFFFF" }}
        >
          SHARE
        </button>
        <button
          onClick={handleCalendar}
          className="px-6 py-3 text-sm tracking-[0.15em] hover:opacity-60 transition-opacity"
          style={{ border: `1px solid ${BLUE}`, color: BLUE }}
        >
          + CALENDAR
        </button>
        {onPublish && (
          <button
            onClick={handlePublish}
            className="px-6 py-3 text-sm tracking-[0.15em] hover:opacity-80 transition-opacity"
            style={{ background: BLUE, color: "#FFFFFF" }}
          >
            TO ROOM
          </button>
        )}
      </div>
      {note && (
        <p className="text-xs pt-3" style={{ color: BLUE }}>{note}</p>
      )}
      {showText && (
        <textarea
          readOnly
          value={text}
          rows={Math.min(12, text.split("\n").length + 1)}
          className="w-full mt-3 p-3 text-sm"
          style={{ border: `1px solid ${LINE}`, color: INK, background: "#FAFAF8" }}
          onFocus={(e) => e.target.select()}
        />
      )}
      {!note && (
        <p className="text-xs pt-3" style={{ color: GRAY }}>
          SHAREはお使いの端末の共有画面を開きます（コピー・LINE・X・Instagramなどはそこから選べます）。
        </p>
      )}
    </div>
  );
}
