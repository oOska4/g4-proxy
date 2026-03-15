const express = require("express");
const ytdlp = require("yt-dlp-exec");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Normalizuj URL YT Music → standardowy YouTube URL (yt-dlp lepiej obsługuje)
function normalizeUrl(url) {
  return url
    .replace("music.youtube.com", "www.youtube.com")
    .split("&si=")[0]; // usuń tracking param
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

// Healthcheck — Render tego wymaga żeby nie usypiać
app.get("/", (req, res) => res.send("ytmusic-server OK"));

// GET /stream?url=...
// Zwraca bezpośredni URL audio streamu dla pojedynczego utworu
app.get("/stream", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "brak url" });

  try {
    const info = await ytdlp(normalizeUrl(url), {
      format: "bestaudio[ext=m4a]/bestaudio",   // m4a (AAC) najlepiej gra z ExoPlayer
      getUrl: true,                              // zwróć tylko URL, nie pobieraj
      noPlaylist: true,
      noWarnings: true,
      quiet: true,
    });

    // info to string z URL streamu
    const streamUrl = info.trim();
    res.json({ stream_url: streamUrl });

  } catch (err) {
    console.error("stream error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /playlist?url=...
// Zwraca listę utworów z playlisty (bez pobierania streamów — to robi /stream)
app.get("/playlist", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "brak url" });

  try {
    const info = await ytdlp(normalizeUrl(url), {
      flatPlaylist: true,       // tylko metadane, bez pobierania streamów
      dumpSingleJson: true,     // zwróć JSON
      noWarnings: true,
      quiet: true,
    });

    // Wyciągnij potrzebne pola
    const tracks = (info.entries || [info]).map((entry) => ({
      id:       entry.id,
      title:    entry.title,
      duration: entry.duration,         // sekundy
      url:      `https://www.youtube.com/watch?v=${entry.id}`,
      thumb:    entry.thumbnail || `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`,
    }));

    res.json({
      playlist_title: info.title || "Playlista",
      count:          tracks.length,
      tracks,
    });

  } catch (err) {
    console.error("playlist error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /info?url=...
// Metadane pojedynczego utworu (tytuł, artysta, miniatura) + stream URL
// Używane gdy apka przechwytuje URL pojedynczego utworu
app.get("/info", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "brak url" });

  try {
    const info = await ytdlp(normalizeUrl(url), {
      format: "bestaudio[ext=m4a]/bestaudio",
      dumpSingleJson: true,
      noPlaylist: true,
      noWarnings: true,
      quiet: true,
    });

    res.json({
      id:         info.id,
      title:      info.title,
      artist:     info.artist || info.uploader || "",
      duration:   info.duration,
      thumb:      info.thumbnail,
      stream_url: info.url,             // bezpośredni URL audio
    });

  } catch (err) {
    console.error("info error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`ytmusic-server listening on ${PORT}`));
