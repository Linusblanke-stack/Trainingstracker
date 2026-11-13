import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const STORAGE_KEY = "trainings-tracker:day-sessions";
const SYNC_INTERVAL_MS = 30_000;
const BATCH_SIZE = 100;

function readLocalSessions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Ungültige lokale Trainingsdaten.");
  return parsed;
}

function normalizeSession(session, userId) {
  if (!session || typeof session !== "object" || !session.id || !session.dayId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(session.date || "")) ||
      !Array.isArray(session.entries)) {
    throw new Error("Eine Trainingseinheit enthält ungültige Daten.");
  }
  return {
    id: String(session.id),
    user_id: userId,
    day_id: String(session.dayId),
    day_name: String(session.dayName || session.dayId),
    training_date: String(session.date),
    entries: session.entries,
  };
}

function sessionFingerprint(row) {
  return JSON.stringify([row.day_id, row.day_name, row.training_date, row.entries]);
}

export default function SupabaseSync() {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Nicht angemeldet");
  const [busy, setBusy] = useState(false);
  const syncing = useRef(false);
  const currentUserId = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) setStatus("Sitzung konnte nicht geprüft werden");
      else setUser(data.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (currentUserId.current !== user?.id) {
      currentUserId.current = user?.id ?? null;
    }
    if (!user) setStatus("Nicht angemeldet");
  }, [user]);

  const sync = useCallback(async () => {
    if (!supabase || !user || syncing.current) return;
    syncing.current = true;
    const expectedUserId = user.id;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || authData.user?.id !== expectedUserId) {
        throw new Error("Anmeldung abgelaufen. Bitte erneut anmelden.");
      }

      const sessions = readLocalSessions();
      if (!sessions.length) {
        if (mounted.current) setStatus("Keine lokalen Einheiten vorhanden");
        return;
      }

      const rows = sessions.map((session) => normalizeSession(session, expectedUserId));
      const ids = rows.map((row) => row.id);
      if (new Set(ids).size !== ids.length) throw new Error("Doppelte Trainings-IDs gefunden.");

      // Compare with the server, not just a local cache. This avoids overwriting
      // newer cloud records after a page reload or on a second device.
      const serverRows = new Map();
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const { data, error } = await supabase
          .from("training_sessions")
          .select("id,day_id,day_name,training_date,entries")
          .eq("user_id", expectedUserId)
          .in("id", ids.slice(i, i + BATCH_SIZE));
        if (error) throw error;
        for (const row of data ?? []) serverRows.set(row.id, row);
      }

      const pending = rows.filter((row) => {
        const server = serverRows.get(row.id);
        if (!server) return true;
        return sessionFingerprint(row) !== sessionFingerprint(server);
      });

      if (!pending.length) {
        if (mounted.current) setStatus(`Aktuell · ${new Date().toLocaleTimeString("de-DE")}`);
        return;
      }

      // Do not silently overwrite existing, different cloud data. This version
      // only uploads new sessions; editing an already uploaded session requires
      // an explicit conflict policy in a later version.
      const conflicts = pending.filter((row) => serverRows.has(row.id));
      if (conflicts.length) {
        throw new Error(`${conflicts.length} abweichende Cloud-Einheit(en). Kein Überschreiben durchgeführt.`);
      }
      const inserts = pending.filter((row) => !serverRows.has(row.id));
      for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
        if (currentUserId.current !== expectedUserId) throw new Error("Benutzerwechsel während der Übertragung.");
        const { error } = await supabase.from("training_sessions")
          .insert(inserts.slice(i, i + BATCH_SIZE));
        if (error) throw error;
      }
      if (mounted.current) setStatus(`${inserts.length} neue Einheiten übertragen · ${new Date().toLocaleTimeString("de-DE")}`);
    } catch (error) {
      console.error("LifeHub-Synchronisierung:", error);
      if (mounted.current) setStatus(`Fehler: ${error.message || "Unbekannter Fehler"}`);
    } finally {
      syncing.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    sync();
    const interval = window.setInterval(sync, SYNC_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, sync]);

  async function sendLink(event) {
    event.preventDefault();
    if (!supabase || !email.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + "/", shouldCreateUser: true },
      });
      if (error) throw error;
      setMessage("Anmeldelink versendet. Bitte im selben Browser öffnen.");
    } catch (error) {
      setMessage(`Anmeldung fehlgeschlagen: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message);
    else {
      setUser(null);
      setMessage("");
      setOpen(false);
    }
  }

  return (
    <div style={{ position: "fixed", right: 14, top: 14, zIndex: 9999, fontFamily: "inherit" }}>
      <button
        type="button"
        aria-label="Cloud-Synchronisierung öffnen"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{ borderRadius: 999, border: "1px solid #555", background: "#171717", color: "#fff", padding: "9px 12px", cursor: "pointer", boxShadow: "0 2px 12px #0008" }}
      >
        ☁ {user ? "✓" : ""}
      </button>
      {open && (
        <section style={{ position: "absolute", right: 0, top: 48, width: "min(310px, calc(100vw - 28px))", maxHeight: "calc(100dvh - 90px)", overflowY: "auto", boxSizing: "border-box", background: "#171717", color: "#f5f5f5", border: "1px solid #555", borderRadius: 12, padding: 16, boxShadow: "0 8px 24px #000a", fontSize: 13 }}>
          <strong>LifeHub Cloud-Synchronisierung</strong>
          {!supabase ? (
            <p role="alert">Supabase-Konfiguration fehlt.</p>
          ) : user ? (
            <>
              <p>Verbunden: {user.email}</p>
              <p role="status" style={{ overflowWrap: "anywhere" }}>{status}</p>
              <button type="button" onClick={sync}>Jetzt prüfen</button>
              <button type="button" onClick={signOut} style={{ marginLeft: 10 }}>Abmelden</button>
            </>
          ) : (
            <form onSubmit={sendLink}>
              <p>Einmalig anmelden</p>
              <input
                type="email" required value={email} onChange={(event) => setEmail(event.target.value)}
                placeholder="E-Mail-Adresse"
                style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 6, border: "1px solid #666", background: "#262626", color: "#fff", marginBottom: 10 }}
              />
              <button type="submit" disabled={busy}>{busy ? "Wird gesendet …" : "Anmeldelink senden"}</button>
            </form>
          )}
          {message && <p role="status" style={{ overflowWrap: "anywhere" }}>{message}</p>}
        </section>
      )}
    </div>
  );
}
