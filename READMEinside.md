# 📻 RadioAndroid PRO

**Internet radio player for Android — built with C#, .NET MAUI, and LibVLC.**

No Kotlin. No Gradle plugins. Pure C# from UI to audio engine.

> **PRO** stands for **P**atched, **R**efined & **O**ptimized —
> not a marketing badge, but an honest description of the development process:
> bugs patched, code refined through six months of testing, VLC engine optimized for live network streams.

---

## What is RadioAndroid?

RadioAndroid PRO is a free internet radio player. You add your own stations (any stream URL), and the app handles the rest — background playback, Android Auto, Bluetooth, equalizer, and stream stability.

For features and screenshots, visit the project website.

🌐 **[Project Website & Google Play → toevi.github.io/RadioAndroidPro](https://toevi.github.io/RadioAndroidPro/)**

---

## 🛡️ Stream Stability — The Hard Problem

**This is where RadioAndroid differs from most hobby radio apps.**

The app is designed to work in a car. In a car, losing network connection is not an edge case — it is routine. Tunnels, dead zones, hand-off between cell towers, switching from Wi-Fi to LTE when leaving home, brief GPS-triggered data bursts that starve the audio buffer. A radio app that can't survive these is useless as a car app. Handling disconnects gracefully is not a bonus feature — it is the baseline requirement.

Internet radio streaming on Android is deceptively simple — until it isn't. Most apps play fine for a few minutes, then silently die when the network hiccups, the server drops the connection, or the phone switches from Wi-Fi to mobile data. The stream just… stops. No error, no recovery, no sound.

### Why this happens

LibVLC is a powerful audio engine, but out of the box it treats every URL like a local file. No network buffering, no auto-reconnect, no tolerance for clock drift on live streams. The first micro-interruption in the network = stream lost.

On top of that, VLC fires its events (Stopped, EndReached, Error) on **native threads**. Calling VLC methods (Stop, Play) from inside those callbacks causes **native mutex deadlocks** — the audio engine freezes permanently with no way to recover except killing the process.

These are not theoretical problems. They are the reason most LibVLCSharp + MAUI radio apps on GitHub have open issues about "stream stops after a few minutes" or "app freezes randomly."

### How RadioAndroid solves it

**Two-layer protection:**

**Layer 1 — VLC Engine Configuration**
The VLC engine is configured specifically for live network streams, not local files.

**Engine-level options** (applied once at LibVLC init — shared across all streams):

| Option | What it does |
|---|---|
| `--network-caching=5000` | 5-second network buffer — absorbs Wi-Fi jitter and brief drops |
| `--live-caching=5000` | 5-second live-stream buffer — prevents underrun on live sources |
| `--http-reconnect` | VLC automatically retries HTTP connections on drop (first line of defense) |
| `--sout-mux-caching=2000` | 2-second mux-level buffer for multiplexed streams |
| `--clock-jitter=0` | Ignores clock drift — live radio has no stable reference clock |
| `--clock-synchro=0` | Disables A/V sync — live = real-time, no sync needed |

**Per-stream options** (applied to each `Media` object before `Play()`):

| Option | What it does |
|---|---|
| `:network-caching=5000` | Per-stream network buffer (reinforces engine setting) |
| `:live-caching=5000` | Per-stream live buffer |
| `:http-reconnect` | Per-stream HTTP reconnect |
| `:adaptive-logic=highest` | HLS/DASH: selects highest available quality |

> **Why both levels?** Engine options are defaults. Per-stream options ensure each new `Media` object inherits the correct settings even if VLC internally resets defaults. Belt and suspenders.

Most brief network hiccups are resolved here — the user never notices.

**Layer 2 — App-Level Recovery (when VLC can't fix it alone)**
- **Reconnect loop** — up to 5 attempts with exponential backoff (1s → 2s → 4s → 8s → 15s)
- **Watchdog timer** — detects silent VLC hangs (no audio activity for 15 seconds) and triggers recovery
- **Cellular fallback** — if Wi-Fi loses internet (common: router loses DNS/uplink), the app binds the process to mobile data and switches back automatically when Wi-Fi recovers
- **Hard reset** — after 3 failed recovery cycles, VLC engine is fully disposed and recreated from scratch
- **Safe threading** — all VLC callbacks dispatch to the thread pool, never calling VLC methods on native threads (prevents the deadlock that kills most LibVLC integrations)
- **Native memory safety** — metadata polling and media references are cleaned up *before* native memory is freed, preventing use-after-free crashes

If everything fails, playback stops cleanly with a status message. Press Play to try again.

### User Stop = Stop

When you press Stop or Pause, the app **stays stopped**. Network changes (switching Wi-Fi, entering home) will not trigger unwanted auto-play. The reconnect system is only active while the app is actually trying to play.

---

## 🔧 Technical Integration — .NET MAUI + LibVLC + Android Services

### The challenge

Building a production-quality radio app with .NET MAUI and LibVLC on Android requires solving problems that have no official documentation and no complete examples:

- **Foreground Service** — Android 12+ requires `startForeground()` within 5 seconds of `startForegroundService()`. Missing this for *any* intent (including station switches) = crash. Most examples only handle Play/Stop actions, not URL intents. **Android 12 / 12.1 (API 31–32) is explicitly not supported** — the combination of `MediaBrowserServiceCompat` + multiple intent types (URL, Play, Stop, Next, Prev) requires compatibility shims on API 31–32 that are not worth the maintenance cost. Android 13+ handles this correctly.

- **MediaBrowserServiceCompat** — Android Auto requires a working media browser service. The Xamarin/MAUI bindings for AndroidX Media are incomplete, poorly documented, and version-sensitive. Getting queue management, metadata updates, and media button handling to work together is a multi-week effort. Two additional AA-specific issues were encountered: (1) **station lists above 10 items** — AA loads browser results in pages via separate `OnLoadChildren` calls, not as a single scrollable list; behavior is correct but head-unit-dependent. (2) **circular navigation** — Next on the last station wraps to the first (and vice versa); intentional for app controls but non-obvious in the AA interface where there is no end-of-list indicator.

- **LibVLC native thread model** — VLC events arrive on native C threads. Any VLC API call from inside a callback = deadlock. This is mentioned in one line of LibVLCSharp docs but has no examples showing the correct pattern for a real app.

- **Native memory lifecycle** — LibVLCSharp wraps native C objects. When you set `MediaPlayer.Media = null`, the native memory is freed immediately, but any C# reference (metadata polling, event handlers) still points to freed memory. This causes SIGSEGV crashes that are impossible to debug without understanding the native/managed boundary.

- **Audio focus** — Phone calls, navigation voice, other apps — Android's audio focus protocol must be implemented correctly or the app fights with other audio sources.

- **WakeLock management** — Without a partial wake lock, the CPU sleeps during background playback and the stream dies. But the lock must be acquired/released at exactly the right moments or it drains the battery.

### What RadioAndroid proves

This started as a hobby project with one goal: prove that **C# + .NET MAUI + LibVLC** can produce a production-quality Android radio app — without a single line of Kotlin, no Gradle plugins, no native Java modules.

Kotlin and Gradle give you a well-documented, well-supported path for Android audio apps. Doing the same in C# with MAUI means solving problems that have no official documentation, no Stack Overflow answers, and no complete examples anywhere. Every issue described above was found the hard way — through crashes, native debugger sessions, and reading LibVLC C source code.

**Six months of testing** across phones, tablets, TV boxes, and car head units. Many problems, many rewrites. The result is code that solves real issues that other LibVLCSharp + MAUI developers hit and leave open on GitHub.

**The app passed Google Play's strict Android Auto and Bluetooth car review** — a process that requires correct `MediaBrowserServiceCompat` implementation, proper media session handling, and passing automated AA compatibility checks. This is not trivial even in Kotlin. Passing it in pure C# validates that the approach works beyond hobby level.

All of the solutions described in this README are implemented in the production code shipped on Google Play.

### Still in development — the unsolvable side

The app is not finished and probably never will be in the "zero issues" sense. Here is why.

Services like **Spotify, YouTube Music, RadioTunes, TuneIn** work reliably because they control **both ends** — the server encodes and delivers the stream in a format they designed, and the client is built specifically for that format. Authentication, DRM, adaptive bitrate, reconnect — all coordinated between server and client they own. When something breaks, they fix both sides.

RadioAndroid is a **generic client with no server**. It connects to whatever URL the user provides — any codec, any container, any server software, any CDN, any authentication scheme. Some streams work perfectly. Some use non-standard ICY metadata. Some serve HTTPS but have expired certificates. Some require a `User-Agent` header. Some silently close connections after 30 minutes. Some HLS playlists refresh on a non-standard interval. The server operator controls all of this and the app can only react.

VLC handles most cases — it is the most format-tolerant player that exists. But **format diversity + no server control = no 100% guarantee**. The two-layer protection described above covers network failures. It cannot cover a stream that simply sends broken data, requires login, or changes its URL monthly.

This is the fundamental difference between a platform app (Spotify) and a universal client (RadioAndroid). It is also the most honest reason why the app will keep receiving updates.

---

## 🏗️ Architecture

```
RadioAndroid/
├── RadioAndroid/
│   ├── Views/
│   │   ├── RadioPage.xaml          — Main player UI
│   │   ├── StationPage.xaml         — Station list (list + tile view)
│   │   ├── EditStationPage.xaml    — Add/edit stations, playlist, EQ
│   │   └── HelpPage.xaml           — User guide
│   ├── Services/
│   │   ├── RadioStateService.cs    — Shared playback state (MVVM)
│   │   ├── StationService.cs        — Station selection logic
│   │   └── SettingsService.cs      — Persisted user settings
│   └── Models/
│       └── Station.cs               — Station model (name + URL)
├── Platforms/Android/
│   ├── AudioPlaybackService.cs         — Main service (partial class)
│   ├── AudioPlaybackService.Playback.cs — Play/Stop/Pause/HardReset
│   ├── AudioPlaybackService.Media.cs    — VLC events, notifications, metadata
│   ├── AudioPlaybackService.Reconnect.cs — Reconnect loop, connectivity, cellular
│   ├── AudioPlaybackService.Queue.cs    — Next/Prev/queue management
│   └── AudioPlaybackService.Callbacks.cs — MediaSession + AudioFocus

```

The `AudioPlaybackService` is a `partial class` split across 6 files by responsibility. This keeps each file focused and manageable while sharing state through the service instance.

---

## 📱 Requirements

- **Android 13+ (API 33)** — minimum supported version
- .NET 10
- Internet connection (Wi-Fi, 4G, 5G)

## 📦 Key Dependencies

### Core (all platforms)

| Package | Version | Purpose |
|---|---|---|
| `Microsoft.Maui.Controls` | 10.0.41 | .NET MAUI UI framework |
| `Microsoft.Maui.Essentials` | 10.0.41 | Platform APIs (Connectivity, Preferences, etc.) |
| `Microsoft.Maui.Graphics` | 10.0.41 | Drawing and graphics primitives |
| `Microsoft.Maui.Resizetizer` | 10.0.41 | SVG → platform icon/splash generation |
| `Microsoft.Extensions.Logging.Debug` | 10.0.3 | Debug logging |
| `CommunityToolkit.Maui` | 14.0.1 | MAUI community extensions |
| `LibVLCSharp` | 3.9.6 | C# bindings for LibVLC audio engine |
| `Vlc.DotNet.Core` | 3.1.0 | VLC .NET core interop layer |
| `Vlc.DotNet.Core.Interops` | 3.1.0 | VLC native interop helpers |

### Android-only

| Package | Version | Purpose |
|---|---|---|
| `VideoLAN.LibVLC.Android` | 3.7.0-beta | Native LibVLC library (`.so` binaries for ARM/x86) |
| `LibVLCSharp.Android.AWindowModern` | 3.9.6 | Android surface/window integration for LibVLC |
| `Xamarin.AndroidX.Media` | 1.7.1.1 | `MediaBrowserServiceCompat` — required for Android Auto |
| `Xamarin.AndroidX.Lifecycle.*` | 2.10.0.1 | AndroidX Lifecycle (Common, Runtime, ViewModel, LiveData, Process, SavedState + Ktx variants) — required by AndroidX.Media and service lifecycle |
| `Xamarin.AndroidX.SavedState.SavedState.Ktx` | 1.4.0.1 | SavedState Kotlin extensions (AndroidX dependency) |

### Windows-only

| Package | Version | Purpose |
|---|---|---|
| `Microsoft.Maui.Graphics.Win2D.WinUI.Desktop` | 10.0.41 | Win2D rendering backend for Windows |

> **Note on AndroidX.Lifecycle packages:** Android Auto's `MediaBrowserServiceCompat` has deep dependencies on AndroidX Lifecycle. Without explicit version pinning of all Lifecycle sub-packages (Common, Runtime, ViewModel, LiveData, Process, SavedState — both Java and Ktx variants), NuGet resolves conflicting transitive versions causing build failures. The 12 Lifecycle packages listed above are the minimum set required for a clean build with `Xamarin.AndroidX.Media` 1.7.1.1 on .NET 10.

---

## 👤 Author

**Tomek Maslowski / tmfgroup**  
2025–2026  
🌐 [toevi.github.io/RadioAndroidPro](https://toevi.github.io/RadioAndroidPro/)

---

## 📄 License

The app is free for personal use.  
LibVLC is used under the [LGPL license](https://www.videolan.org/legal.html).  
Users are responsible for ensuring they have proper access rights to all streams they add.
