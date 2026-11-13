
import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase =
  URL && KEY ? createClient(URL, KEY) : null;

const STORAGE_KEY = "trainings-tracker:day-sessions";
const SYNC_INTERVAL = 30000;

function readSessions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error("Lokale Trainingsdaten sind ungültig.");
  }

  return data;
}

export default function SupabaseSync() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Nicht verbunden");
  const [busy, setBusy] = useState(false);

  const syncing = useRef(false);

  useEffect(() => {
    if (!supabase) return;

    let active = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (active && !error) {
        setUser(data.user ?? null);
      }
    });

    const { data: listener } =
      supabase.auth.onAuthStateChange((_event, session) => {
        if (active) {
          setUser(session?.user ?? null);
        }
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function sendLoginLink(event) {
    event.preventDefault();
    if (!supabase || !email.trim()) return;

    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin + "/",
        shouldCreateUser: true,
      },
    });

    setMessage(
      error
        ? "Anmeldung fehlgeschlagen: " + error.message
        : "Prüfe dein E-Mail-Postfach und öffne den Anmeldelink."
    );

    setBusy(false);
  }

  async function syncSessions() {
    if (!supabase || !user || syncing.current) return;

    syncing.current = true;

    try {
      const sessions = readSessions();

      if (sessions.length === 0) {
        setStatus("Keine lokalen Trainingseinheiten vorhanden");
        return;
      }

      const rows = sessions.map((session) => {
        if (
          !session.id ||
          !session.dayId ||
          !session.date ||
          !Array.isArray(session.entries)
        ) {
          throw new Error("Ungültige Trainingseinheit gefunden.");
        }

        return {
          id: String(session.id),
          user_id: user.id,
          day_id: String(session.dayId),
          day_name: String(session.dayName || session.dayId),
          training_date: session.date,
          entries: session.entries,
          updated_at: new Date().toISOString(),
        };
      });

      // Kleine Pakete vermeiden zu große API-Anfragen.
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);

        const { error } = await supabase
          .from("training_sessions")
          .upsert(batch, {
            onConflict: "user_id,id",
          });

        if (error) throw error;
      }

      setStatus(
        `${rows.length} Trainingseinheiten synchronisiert – ` +
          new Date().toLocaleTimeString("de-DE")
      );
    } catch (error) {
      console.error("LifeHub Sync:", error);
      setStatus("Synchronisationsfehler: " + error.message);
    } finally {
      syncing.current = false;
    }
  }

  useEffect(() => {
    if (!user) {
      setStatus("Nicht verbunden");
      return;
    }

    syncSessions();

    const interval = window.setInterval(
      syncSessions,
      SYNC_INTERVAL
    );

    return () => window.clearInterval(interval);
  }, [user]);

  async function logout() {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage(error.message);
    } else {
      setUser(null);
      setMessage("");
      setStatus("Nicht verbunden");
    }
  }

  if (!supabase) {
    return (
      <div style={{ color: "#f87171", padding: 12 }}>
        Supabase-Konfiguration fehlt.
      </div>
    );
  }

  return (
    <section
      style={{
        margin: "16px",
        padding: "16px",
        background: "#171717",
        border: "1px solid #404040",
        borderRadius: "12px",
        color: "#f5f5f5",
        fontSize: "13px",
      }}
    >
      <strong>LifeHub Cloud-Synchronisierung</strong>

      {!user ? (
        <form onSubmit={sendLoginLink}>
          <p>Mit Supabase verbinden</p>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Deine E-Mail-Adresse"
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: 10,
              marginBottom: 10,
              background: "#262626",
              color: "white",
              border: "1px solid #525252",
              borderRadius: 6,
            }}
          />

          <button type="submit" disabled={busy}>
            {busy ? "Wird gesendet..." : "Anmeldelink senden"}
          </button>
        </form>
      ) : (
        <div>
          <p>Verbunden: {user.email}</p>

          <p>{status}</p>

          <button type="button" onClick={syncSessions}>
            Jetzt synchronisieren
          </button>

          <button
            type="button"
            onClick={logout}
            style={{ marginLeft: 10 }}
          >
            Abmelden
          </button>
        </div>
      )}

      {message && <p role="status">{message}</p>}
    </section>
  );
}
