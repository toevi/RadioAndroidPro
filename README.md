📻 RadioAndroid PRO

🌐 **[Project Website & Google Play → toevi.github.io/RadioAndroidPro](https://toevi.github.io/RadioAndroidPro/)**

**Internet radio player for Android — app written in C# and .NET MAUI, powered by the native LibVLC engine via C# bindings.**

No Kotlin. No Gradle plugins. Pure C# from UI to audio engine integration — the playback engine is LibVLC, a battle-tested open-source media engine, not something written from scratch.

> **PRO** stands for **P**atched, **R**efined & **O**ptimized —
> not a marketing badge, but an honest description of the development process:
> bugs patched, code refined through six months of testing, VLC engine optimized for live network streams.

---

**The UI is five pages. It looks like any other radio app. It is not.**

The interface is intentionally minimal — a remote control, nothing more. That simplicity is deliberate. The engineering that makes it work reliably is anything but simple.

Behind the play button: a native LibVLC audio engine wrapped in C# bindings, running inside an Android foreground service, connected to Android Auto, Bluetooth media session, system notifications, and a multi-surface state synchronization layer — all built in .NET MAUI, a framework that was never designed to go this deep into Android internals. No LiveData. No ViewModel. No Kotlin platform tooling. Every native integration — audio focus, media session, foreground service timing, cellular fallback, native memory safety — implemented from scratch.

This README is not a feature list. It is a technical account of what went wrong and how it was fixed.

---

> *The real work happens in the background services: audio engine management, stream recovery, Android Auto integration, Bluetooth session handling, and state synchronization across the app. Getting all of this to work reliably in C# and .NET MAUI — a non-native layer on top of Android — was significantly harder than the equivalent in Kotlin, where the platform APIs are first-class citizens. MAUI abstracts the platform, which is convenient until you need to go deep into Android internals. Then you're fighting the framework as much as the problem. The result: a single C# codebase that runs on phones, tablets, Android TV, TV boxes, Android Desktop, Android Auto, Android Automotive OS, Bluetooth devices, and ChromeOS — tested and working on all of them.*

> *Why C# and .NET MAUI? One codebase runs natively on phones, tablets, Android Desktop, Android Auto, AAOS, and ChromeOS — without separate layout files or separate modules per form factor. Kotlin and Gradle are Android-only; there is no migration path from there to Windows or macOS. A Windows desktop port is a planned next step — adding one target to `.csproj` is all it takes. See [Why .NET MAUI — Not Kotlin, Not Gradle](#-why-net-maui--not-kotlin-not-gradle) for a full technical comparison.*

> *This app navigates uncharted waters. There are very few examples of .NET MAUI + C# + LibVLC on Android pushed this far — into native audio focus, background services, Android Auto, and deep platform integration. Some things did not work on the first attempt, or the second. The solutions in this README are the result of that process — not a straight line from idea to working code, but a map drawn while sailing.*

---

## Table of Contents

- [Why .NET MAUI — Not Kotlin, Not Gradle](#️⃣-why-net-maui--not-kotlin-not-gradle)
- [Stream Stability — The Hard Problem](#-stream-stability--the-hard-problem)
- Technical Deep Dives
  - [1. LibVLC Native Thread Deadlock](#1-libvlc-native-thread-deadlock)
  - [2. SIGSEGV from LibVLCSharp Native Memory](#2-sigsegv-from-libvlcsharp-native-memory)
  - [3. Foreground Service Crash on Android 12 / 12.1](#3-foreground-service-crash-on-android-12--121)
  - [3.1. Station Edit, Add, Delete — Service Must Be Stopped First](#31-station-edit-add-delete--service-must-be-stopped-first)
  - [4. MediaBrowserServiceCompat and Android Auto](#4-mediabrowserservicecompat-and-android-auto)
  - [5. AudioFocus and UI/Service State Synchronization](#5-audiofocus-and-uiservice-state-synchronization)
  - [5.1. Favorites — Multi-Surface State Synchronization](#51-favorites--multi-surface-state-synchronization)
  - [5.2. Android Auto + Favorites — Synchronization Problem and Solution](#52-android-auto--favorites--synchronization-problem-and-solution)
  - [6. LibVLCSharp Memory Safety Checklist](#6-libvlcsharp-memory-safety-checklist)
  - [7. VLC Equalizer in .NET MAUI (LibVLCSharp)](#7-vlc-equalizer-in-net-maui-libvlcsharp)
  - [8. AAOS Album Art: Bitmap vs URI](#8-aaos-album-art-bitmap-vs-uri)
  - [9. Google Play AAOS Distribution](#9-google-play-aaos-distribution--why-the-apk-works-but-the-store-rejects-it)
  - [10. Android Automotive OS — Why the Port Was Abandoned](#10-android-automotive-os--why-the-port-was-abandoned)
- [System Architecture & Protection Layers](#-architecture)
- [Key Dependencies](#-key-dependencies)
- [Development Environment](#️-development-environment)
- [Requirements](#-requirements)
- [License & Author](#-author)

---

### This is not Spotify, YouTube or RadioTunes

Services like Spotify, YouTube, or RadioTunes are stable because they own and control the entire stack — the server infrastructure, the streaming protocol, the content delivery network, and the client app. Every component is designed to work with every other component. If something breaks, they fix both ends. Reliability is engineered into a closed system.

RadioAndroid is only the client. It has no control over the server side. It must handle hundreds of different radio servers, streaming protocols (HTTP, HLS, AAC, MP3, Ogg, DASH, ICY, and more), server configurations, and network conditions — none of which were designed with this client in mind. Every station is a different unknown. The server can drop the connection without warning, send malformed headers, change bitrate mid-stream, or simply go offline. The client has to survive all of it gracefully.

That is the real technical challenge — and the reason stream stability required the depth of work documented in this README. Every reconnect loop, every watchdog timer, every threading workaround, every native memory guard exists because there is no cooperative server on the other end. Just an unknown stream, an unknown protocol, and a client that has to stay alive regardless.

### Supported platforms

| Platform | Notes |
|---|---|
| 📱 Android phones & tablets | Android 8–16 (API 26–36) |
| 📺 Android TV / TV boxes | Full support — tested on TV boxes used LAN WiFi home network Chromecast |
| 🖥 Android Desktop | Supported — large-screen layout scales correctly |
| 🚗 Android Auto | Tested and passed Google Play AA review |
| 🚙 Android Automotive OS | Port abandoned — technical implementation complete but incompatible with Google Play Automotive Android content policy (see section below) |
| 🎵 Bluetooth devices | Headphones, speakers, car head units, steering wheel controls, HiFi receivers — any BT device that uses Android media session. Wear OS watches not supported. |

---

> **Note:** The app works fully and without any restrictions on native Android tablets (including factory-installed in-car units), Android Auto, Bluetooth car/head units, and Android Automotive OS in mobile mode (installed on a tablet or emulator). Full station management — add, edit, delete — works in all of these configurations. However, after complete AAOS adaptation, the app was rejected on Google Play for that platform: AAOS policy prohibits station management (adding stations) on the car screen, even though the feature works correctly outside the store's restrictions. This limitation does not affect Android Auto, Bluetooth, or native Android tablets.


---

## ⚙️ Why .NET MAUI — Not Kotlin, Not Gradle

### Scalability: one codebase, multiple platforms

Kotlin and Gradle are Android-only. There is no migration path from there to Windows or macOS — it is architecturally impossible. C# and .NET MAUI compile the same codebase natively for Android, Windows, and macOS without rewriting the application layer.

| | .NET MAUI (C#) | Kotlin + Gradle |
|---|---|---|
| Android | ✅ | ✅ |
| Windows | ✅ (WinUI 3) | ❌ |
| macOS | ✅ (Mac Catalyst) | ❌ |
| iOS | ✅ | ❌ |
| Single codebase | ✅ | ❌ Android-only |

For this project that means: a Windows Desktop port = adding a target in `.csproj` and running the build. Playback logic, reconnect, watchdog, station management — all of it already works, nothing rewritten.

**Kotlin:**
```kotlin
// Kotlin/Android — does not compile for Windows or macOS
// Every new target = new project, new language, new codebase

class RadioService : Service() {
    fun startPlayback(url: String) {
        // Android-only. There is no path from here to desktop.
    }
}
```

**C# / MAUI:**
```csharp
// Same code runs on Android, Windows, and macOS
// Changing the target = one line in .csproj

public partial class RadioService
{
    public void StartPlayback(string url)
    {
        // Portable logic — platform is irrelevant
        _mediaPlayer.Play(new Media(_libVLC, new Uri(url)));
    }
}
```

```xml
<!-- .csproj — adding a Windows target is literally one line -->
<TargetFrameworks>net10.0-android;net10.0-windows10.0.19041.0</TargetFrameworks>
```

---

### One codebase — all form factors

In Kotlin, targeting phones, tablets, desktop, Android Auto, and Android Automotive OS means separate layout resources, separate navigation patterns, and often separate modules. Each form factor has its own design contract with the platform.

In MAUI, the same layout adapts to every screen size and surface through a single responsive definition. No separate layout files per device class. No duplicated navigation logic. The same C# page renders correctly on a 5" phone, a 12" tablet, a desktop window, an Android Auto head unit, and an AAOS in-dash display.

**Kotlin — separate layout per form factor:**
```kotlin
// res/layout/player.xml          → phone
// res/layout-large/player.xml    → tablet
// res/layout-xlarge/player.xml   → desktop / large screen
// res/layout-car/player.xml      → Android Auto (separate MediaBrowserService UI contract)
// Each file maintained independently — any UI change must be applied to all of them
```

**C# / MAUI — one layout, all surfaces:**
```csharp
// Single page definition — adapts to any screen size at runtime
new Grid
{
    ColumnDefinitions =
    {
        new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) },
        new ColumnDefinition { Width = new GridLength(2, GridUnitType.Star) }
    }
}

// Responsive behavior via OnSizeAllocated — one place, all targets
protected override void OnSizeAllocated(double width, double height)
{
    base.OnSizeAllocated(width, height);
    MainLayout.Orientation = width > 700
        ? StackOrientation.Horizontal   // tablet / desktop / AAOS
        : StackOrientation.Vertical;    // phone
}
```

Android Auto and AAOS use a separate UI surface driven by `MediaBrowserService` — MAUI does not interfere with that contract. The service layer, state management, and playback logic are shared in full. Only the surface that renders the controls differs, and that difference is handled by the platform, not by duplicated application code.

The result: UI changes, bug fixes, and new features are applied once and propagate to every supported surface — phones, tablets, Android Desktop, Android Auto, AAOS, and ChromeOS.

---

### Performance and responsiveness

MAUI compiles to native AOT (Ahead-of-Time) code — no interpreter, no JIT in hot paths. The UI renders through native platform controls: on Android these are real Android views, not a webview or an emulated canvas.

LibVLC runs on a native C thread at OS level — MAUI does not get in its way. The C# layer is thin: state management, event dispatching, reconnect logic. The audio engine operates below the JVM and below the .NET runtime regardless.

**Kotlin + Gradle — extra JVM layer on top:**
```kotlin
// Kotlin compiles to JVM bytecode → Dalvik/ART
// JIT on startup, GC pauses, warmup on first run

lifecycleScope.launch {
    viewModel.playbackState.collect { state ->
        updateUI(state) // through LiveData → ViewModel → Coroutine → UI
    }
}
```

**C# / MAUI — AOT, no JVM:**
```csharp
// AOT compilation → native ARM binary, no JIT warmup
// Events directly from the VLC engine, no intermediate layer

_mediaPlayer.Playing += (_, _) =>
    MainThread.BeginInvokeOnMainThread(() => UpdateUI(PlaybackState.Playing));
```

No ViewModel/LiveData/Coroutine stack = fewer layers between event and UI. Dispatching from a VLC thread to the Android main thread is one method call (`MainThread.BeginInvokeOnMainThread`), not a chain of reactive streams.

---

### Dependencies: NuGet vs Gradle

Kotlin and Gradle have a well-known dependency hell problem — transitive version conflicts cause build failures that are hard to diagnose without deep knowledge of the Gradle ecosystem.

NuGet with explicit version pinning is deterministic: every dependency has exactly one version, conflicts are visible immediately, and resolved in a single `.csproj` file.

**Gradle — transitive dependency version conflict:**
```groovy
// build.gradle — versions can be silently overridden by transitive deps
// "Duplicate class kotlin.collections.jdk8" — classic hard-to-trace error
dependencies {
    implementation "androidx.media:media:1.7.1"
    // Gradle pulls its own lifecycle versions — they may be incompatible
}
```

**NuGet — explicit pinning, deterministic build:**
```xml
<!-- .csproj — all versions explicit, build is always reproducible -->
<PackageReference Include="Xamarin.AndroidX.Lifecycle.Runtime" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.ViewModel" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Media" Version="1.7.1.2" />
```

---

### Summary

.NET MAUI is not a compromise. It is a scalability choice: one codebase, native performance, a straightforward path to Windows and macOS, and no per-form-factor layout duplication. Kotlin and Gradle are the right choice if the target is Android phones and only ever Android phones. If the app needs to run correctly on tablets, desktops, Android Auto, and AAOS — and a desktop port is a realistic next step — MAUI eliminates that technical debt from the first commit.

---

## 🛡 Stream Stability — The Hard Problem

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

**Layer 2 — App-Level Recovery (when VLC can't fix it alone)**

- **Reconnect loop** — up to 5 attempts with exponential backoff (1s → 2s → 4s → 8s → 15s)
- **Watchdog timer** — detects silent VLC hangs (no audio activity for 15 seconds) and triggers recovery
- **Cellular fallback** — if Wi-Fi loses internet (common: router loses DNS/uplink), the app binds the process to mobile data and switches back automatically when Wi-Fi recovers
- **Hard reset** — after 3 failed recovery cycles, VLC engine is fully disposed and recreated from scratch
- **Safe threading** — VLC callbacks that trigger reconnect logic (`EndReached`, `EncounteredError`) dispatch to the thread pool via `ThreadPool.QueueUserWorkItem`, never calling VLC methods on native threads (prevents the deadlock that kills most LibVLC integrations). State-only callbacks (`Playing`, `Paused`, `Stopped`) run directly but never call back into VLC.
- **Native memory safety** — metadata polling and media references are cleaned up *before* native memory is freed, preventing use-after-free crashes

If everything fails, playback stops cleanly with a status message. Press Play to try again.

### User Stop = Stop

When you press Stop or Pause, the app **stays stopped**. Network changes (switching Wi-Fi, entering home) will not trigger unwanted auto-play. The reconnect system is only active while the app is actually trying to play.

> **Known limitation:** In certain edge cases — network handoff between Wi-Fi and mobile data, Bluetooth or Android Auto disconnection mid-stream — the reconnect loop may continue without a stop flag being set. In these cases, pressing Stop manually terminates playback. These cases were identified through daily use testing and fixed..

> *This is a project, not a finished product. Bugs are fixed continuously as they surface — driven by a growing number of users, devices, and platforms. Every new device, every new Android version, every new head unit is a potential new edge case. That is the nature of a universal client running on hardware it has never seen before.*

---

## 🔧 Technical Deep Dives

Building a radio app sounds straightforward. Play a URL. Show a title. Stop when asked.

It is not straightforward. Not on Android, not with LibVLC, not in .NET MAUI, and not when the app needs to survive real-world conditions: network drops, phone calls, Bluetooth reconnects, Android Auto on a car head unit, and a native audio engine that deadlocks permanently if you call it from the wrong thread.

This section documents the problems that had no answer in any official documentation — only in crash logs, native debugger sessions, and LibVLC C source code. Each section is a problem that was hit in production, diagnosed, and fixed.

If you are building a radio or audio app with this stack and hitting walls, this is for you.

---
### 1. LibVLC Native Thread Deadlock

**The symptom**

The app freezes completely. No crash, no exception, no log output. The audio engine hangs permanently and the only recovery is killing the process. This happens seemingly at random — often after a network event, a stream error, or a station switch.

**The root cause**

VLC fires its playback events (`EndReached`, `Stopped`, `EncounteredError`, `Playing`) on **native C threads** — not on the managed .NET thread pool, not on the Android main thread. These are raw pthreads inside the VLC engine.

The VLC native engine holds internal mutexes while dispatching these events. If you call **any** VLC method (including `Stop()`, `Play()`, `Media = null`) from inside an event handler, VLC tries to acquire the same mutexes that are already held by the event dispatch. Classic deadlock. The audio thread waits forever. The engine is frozen.

This is mentioned in one sentence in the LibVLCSharp docs. There are no examples showing the correct pattern for a production app.

**The wrong pattern — do not do this**

```csharp
_mediaPlayer.EndReached += (sender, e) =>
{
    // ❌ DEADLOCK — this runs on a native VLC thread
    // VLC holds internal mutexes while firing this event
    _mediaPlayer.Stop();       // tries to acquire the same mutexes → freeze
    _mediaPlayer.Media = null; // same problem
    StartReconnect();          // if this calls Play() → freeze
};
```

This pattern appears in most LibVLCSharp examples on GitHub and Stack Overflow. It works fine in demos where you click buttons manually. It deadlocks reliably in production under load.

**The correct pattern**

Dispatch immediately off the native thread. Do not call any VLC method before leaving the callback.

```csharp
_mediaPlayer.EndReached += (sender, e) =>
{
    // ✅ Get off the native thread immediately — no VLC calls here
    Task.Run(() => HandleEndReached());
};

_mediaPlayer.EncounteredError += (sender, e) =>
{
    Task.Run(() => HandleError());
};

_mediaPlayer.Stopped += (sender, e) =>
{
    Task.Run(() => HandleStopped());
};

private void HandleEndReached()
{
    // ✅ Now on thread pool — safe to call VLC methods
    _mediaPlayer.Stop();
    _mediaPlayer.Media = null;
    StartReconnect();
}
```

`Task.Run()` is the minimum viable fix — it illustrates the principle: get off the native thread before calling anything VLC-related. The production implementation uses `ThreadPool.QueueUserWorkItem()` for callbacks that trigger reconnect logic (`EndReached`, `EncounteredError`) — it is lighter than `Task.Run()` because it does not create a full `Task` object with cancellation machinery, which is unnecessary for fire-and-forget VLC callbacks. The principle is identical; the choice is an optimization.

**Additional rules**

- Never call `_mediaPlayer.Stop()`, `_mediaPlayer.Play()`, or `_mediaPlayer.Media = X` from inside any VLC event handler, even indirectly through method calls.
- If you use `Dispatcher.Dispatch()` or `MainThread.BeginInvokeOnMainThread()`, make sure you do not call VLC methods on the UI thread either — dispatching to the UI thread does not solve the problem if the UI thread then calls back into VLC while the native thread is still in the event dispatch phase.
- The safe pattern is always: native VLC event → `Task.Run()` → your logic.

---

### 2. SIGSEGV from LibVLCSharp Native Memory

**The symptom**

The app crashes with `SIGSEGV` (signal 11) — a native segmentation fault. It appears in the crash log as a crash inside native LibVLC code, not in your C# code. The stack trace points to VLC internals. It is intermittent and difficult to reproduce consistently. It often happens during station switches, rapid play/stop sequences, or when the app is backgrounded.

**The root cause**

LibVLCSharp wraps native C objects (`libvlc_media_t`, `libvlc_media_player_t`) behind C# handles. The critical point: **when you set `MediaPlayer.Media = null`, the native memory for the previous `Media` object is freed immediately**.

But "freed" at the native level does not mean "freed" at the C# level. Any C# code still holding a reference to the old `Media` — event handlers, background polling loops, metadata readers — now holds a pointer to freed native memory. The next access is a use-after-free crash at the C level, which surfaces as SIGSEGV.

This is the native/managed boundary problem. The GC manages C# objects, but it has no visibility into native memory. Native memory is freed when LibVLC decides to free it, not when the GC collects the C# wrapper.

**The crash scenario**

```csharp
// Background metadata polling — runs every 2 seconds
private async Task PollMetadataAsync()
{
    while (true)
    {
        await Task.Delay(2000);
        // ❌ If Media was set to null between the delay and this line,
        // native memory is already freed → SIGSEGV
        var title = _mediaPlayer.Media?.Meta(MetadataType.Title);
    }
}

// Meanwhile, on station switch:
private void SwitchStation(string url)
{
    _mediaPlayer.Stop();
    _mediaPlayer.Media = null; // ← native memory freed here
    _mediaPlayer.Media = new Media(_libVlc, new Uri(url));
    _mediaPlayer.Play();
}
```

The null-conditional `?.` does not protect you here. The C# `Media` property may return a non-null wrapper object while the underlying native memory is already freed. The crash happens inside the native call that follows.

**The correct pattern**

Clean up all references and stop all polling *before* freeing native memory. Use a guard flag to prevent re-entry.

> **Note on `Thread.Sleep(50)`:** The 50ms pause in the pattern below is intentional — it is not a hack or a workaround. LibVLC has a known internal micro-freeze during native media teardown. Without this pause, the cancellation token is set but the polling loop has not yet had a chance to observe it and exit before native memory is freed. 50ms is the minimum reliable window tested in production; removing it reintroduces SIGSEGV crashes.

```csharp
private CancellationTokenSource _metadataCts;
private volatile bool _mediaReleasing = false;

private async Task PollMetadataAsync(CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        await Task.Delay(2000, ct);

        // ✅ Check guard before touching native objects
        if (_mediaReleasing) break;

        try
        {
            var title = _mediaPlayer.Media?.Meta(MetadataType.Title);
            UpdateUI(title);
        }
        catch (Exception)
        {
            // Native boundary — exceptions here can indicate freed memory
            break;
        }
    }
}

private void SwitchStation(string url)
{
    // ✅ Step 1: Signal all consumers to stop
    _mediaReleasing = true;

    // ✅ Step 2: Cancel and wait for polling to stop
    _metadataCts?.Cancel();
    _metadataCts?.Dispose();

    // ✅ Step 3: Give background tasks a moment to exit
    // Thread.Sleep(50) is intentional here — not a hack.
    // LibVLC has a known internal micro-freeze during media teardown on the native side.
    // Without this pause, the cancellation token is set but the polling loop hasn't had
    // a chance to observe it and exit before native memory is freed below.
    // 50ms is the minimum reliable window; removing it reintroduces SIGSEGV crashes.
    Thread.Sleep(50);

    // ✅ Step 4: Now safe to free native memory
    _mediaPlayer.Stop();
    var oldMedia = _mediaPlayer.Media;
    _mediaPlayer.Media = null;
    oldMedia?.Dispose();

    // ✅ Step 5: Reset guard and start new media
    _mediaReleasing = false;
    _metadataCts = new CancellationTokenSource();

    var newMedia = new Media(_libVlc, new Uri(url));
    newMedia.AddOption(":network-caching=5000");
    newMedia.AddOption(":live-caching=5000");
    newMedia.AddOption(":http-reconnect");
    _mediaPlayer.Media = newMedia;

    _ = PollMetadataAsync(_metadataCts.Token);
    _mediaPlayer.Play();
}
```

**Key rules**

- Always cancel and await (or synchronously wait for) any background loop that accesses `Media` or `MediaPlayer` before setting `Media = null`.
- Dispose the old `Media` object explicitly. Do not rely on the GC — native memory is not GC-managed.
- The `_isStartingPlayback` guard flag (checked inside `lock (_commandGate)`) prevents the `Stopped` callback from corrupting new playback state during Play→Stop→Play sequences.
- The cleanup ordering rule — cancel `_metaPollCts`, detach `MetaChanged` handler, null `_currentMediaForMeta`, then `Stop()`/`Media = null` — must be followed in every code path that resets the player (`PlayRadio`, `StopRadio`, `HardResetVlc`, `OnDestroy`).
- Never access `Media.Meta()` or any other `Media` method after `MediaPlayer.Media` has been set to null or replaced.

---


### 3. Foreground Service Crash on Android 12 / 12.1 (API 31–32)

**The symptom**

The app crashes on Android 12 and 12.1 devices specifically. The crash is a `ForegroundServiceDidNotStartInTimeException` or a `RemoteServiceException`. It happens when switching stations, not just on initial start. On Android 13+ (API 33+) the same code works fine. On Android 11 and below it also works fine.

**The root cause**

Android 12 introduced a strict rule: after calling `startForegroundService()`, the service must call `startForeground()` **within 5 seconds**, or the system kills it with an ANR-style crash.

This rule is well documented. What is not documented: **it applies to every intent delivered to the service**, not just the initial start. When you switch stations, you typically send a new intent to the running service with the new URL. The service receives this intent via `OnStartCommand()`. On Android 12, the 5-second clock restarts on every such intent. If your `OnStartCommand()` does any async work before calling `startForeground()` again, you hit the timeout.

Additionally, `API 31–32` has a broken interaction with `StopForeground()`. Calling `StopForeground(true)` on API 31–32 in certain sequences can cause `IllegalArgumentException`. The fix (`StopForegroundCompat()`) requires a compatibility shim that behaves differently on API 31–32 vs API 33+.

**The crash sequence on API 31–32**

```csharp
// ❌ This works on API 33+, crashes on API 31-32
[return: GeneratedEnum]
public override StartCommandResult OnStartCommand(Intent intent, StartCommandFlags flags, int startId)
{
    var url = intent.GetStringExtra("station_url");

    // Some async prep work here...
    Task.Run(async () =>
    {
        await PrepareMediaAsync(url); // ← async gap here
        StartForeground(NotificationId, BuildNotification()); // ← too late on API 31-32
        _mediaPlayer.Play();
    });

    return StartCommandResult.Sticky;
}
```

**The correct pattern for API 31–32**

Call `StartForeground()` **synchronously and immediately** at the top of `OnStartCommand()`, before any async work. Update the notification content afterward.

```csharp
[return: GeneratedEnum]
public override StartCommandResult OnStartCommand(Intent intent, StartCommandFlags flags, int startId)
{
    // ✅ Call StartForeground immediately — before any async work
    StartForeground(NotificationId, BuildNotification());

    var action = intent?.Action;
    var url = intent?.GetStringExtra("station_url");

    Task.Run(async () =>
    {
        switch (action)
        {
            case "ACTION_PLAY":
                await StartPlaybackAsync(url);
                break;
            case "ACTION_STOP":
                StopPlayback();
                StopForegroundCompat(); // ← compatibility shim
                break;
        }
        UpdateNotification();
    });

    return StartCommandResult.Sticky;
}

private void StopForegroundCompat()
{
    if (Build.VERSION.SdkInt >= BuildVersionCodes.N)
    {
        if (Build.VERSION.SdkInt >= BuildVersionCodes.S &&
            Build.VERSION.SdkInt <= (BuildVersionCodes)32)
        {
            StopForeground(true); // bool overload still works on 31-32
        }
        else
        {
            StopForeground(StopForegroundFlags.Remove);
        }
    }
    else
    {
        StopForeground(true);
    }
}
```

**Rule summary for Foreground Services in audio apps**

| Scenario | Rule |
|---|---|
| Initial `startForegroundService()` | Call `startForeground()` within 5 seconds |
| Station switch (new intent to running service) | Call `startForeground()` again at the top of `OnStartCommand()` — the 5-second clock resets |
| `StopForeground()` on API 31–32 | Use the `bool` overload or a compat shim — `StopForegroundFlags` enum has issues on these API levels |
| API 33+ | `StopForeground(StopForegroundFlags.Remove)` works correctly |

> **Testing tip:** Always test on API 31 or 32 specifically. Emulators are fine here — the issue is reproducible on any API 31–32 image. API 33+ emulators will not surface this bug.

---


### 3.1. Station Edit, Add, Delete — Service Must Be Stopped First

> **Note:** This is a constraint specific to this application's architecture, discovered through real-device testing. It is not documented anywhere in MAUI or LibVLCSharp guides because it emerges from the combination of a live VLC stream, an Android foreground service holding a native media player instance in memory, and a flat JSON file used as the station store.

**Why JSON, not a database**

The station list is stored as a plain JSON file — one file, no schema, no migrations, no extra libraries. This was a deliberate design choice: the file is small, human-readable, directly editable, and trivially serialized with the built-in .NET JSON APIs. There is no SQLite dependency, no ORM, no database engine to initialize or version. For a list of internet radio URLs, a database would add complexity without adding value. The trade-off is that the file is read once at startup — it is not watched for changes at runtime. That constraint is what makes the rule below necessary.

**The symptom**

If you add, edit, or delete a station while the service is running and a stream is playing, the change is written to `stacje.json` on disk — but the service is unaware of it. The service holds its own in-memory copy of the URL it received when playback started. That URL is also held inside the native LibVLC media player instance.

The most visible case: deleting a station that is currently playing. After deletion the station no longer exists in the list or on disk, but VLC continues playing it from the URL it already has in memory. The stream does not stop. The station is gone from the UI but still audible. This was verified on a real device — the deleted station kept playing until the service was manually stopped.

**Why this happens**

The Android foreground service is a separate component with its own lifecycle. Once started, it holds:

1. A native `LibVLC` instance and a `MediaPlayer` bound to the current stream URL
2. The `title` string passed via `Intent` extras at startup
3. The `MediaSession` metadata built from that title and URL

None of these are updated when `stacje.json` changes on disk. The service does not watch the file. It has no observer, no reload trigger, no notification mechanism. It only reads new data when a new `Intent` arrives with a new URL.

**The rule**

Any operation that modifies station data — add, edit (name or URL), delete — must be preceded by stopping the service. In this app, the edit pages enforce this: if playback is active when the user enters the edit screen, a warning is shown and the user must stop playback before saving changes.

If this rule is not enforced and the user edits the URL of the currently playing station, two things go wrong simultaneously:
- The service continues playing the old URL (which may now be invalid or point to a different stream)
- The next time the user presses Play, the UI sends the new URL, but the service may be in an inconsistent state from the previous stream

**The practical constraint**

This is not a design flaw that can be easily eliminated — it is a consequence of how Android foreground services and native media engines work. The service owns the native playback object. Injecting new state into a running native media engine mid-stream is not safe without a full stop-reinitialize-play cycle, which is effectively the same as stopping and restarting. Stopping the service before editing is the correct and safe approach.

---


### 4. MediaBrowserServiceCompat and Android Auto

**The symptom**

The app passes AA certification on paper but behaves unexpectedly on head units: station list is cut off at 10 items, navigation wraps around unexpectedly, metadata updates lag, or the media session stops responding to hardware controls after a period of inactivity.

**The root cause (multiple issues)**

Android Auto requires a working `MediaBrowserServiceCompat` implementation. The Xamarin/MAUI C# bindings for `androidx.media` are incomplete and poorly documented. Problems compound: several behaviors that work correctly in the Java/Kotlin world simply do not have complete C# examples anywhere.

#### Issue A: Station list limit — why stations above 10 disappear

**The symptom**

You have 20 or 30 stations. In the Android Auto interface only 10 appear. Stations 11 and up are simply missing — no scrolling past 10, no "load more" button, no error. The list is silently truncated.

**Why this happens**

Android Auto's `MediaBrowser` applies a per-page limit when loading `OnLoadChildren()` results. The default page size is **10 items**. This is not a hard cap baked into the protocol — it is a per-head-unit setting that varies between implementations — but in practice the majority of head units and the official DHU emulator page at 10.

When the head unit supports pagination, it calls the **three-argument** overload of `OnLoadChildren` and passes a `Bundle` with two keys:

```csharp
// These constants are in MediaBrowserCompat:
// MediaBrowserCompat.ExtraPage      — zero-based page index (0 = first page)
// MediaBrowserCompat.ExtraPageSize  — how many items per page
```

If your service only overrides the **two-argument** version `OnLoadChildren(string parentId, Result result)`, these pagination parameters are silently dropped. The system falls back to your implementation, which returns all items — but the head unit only displays the first page of them. The rest are received but discarded.

**The wrong pattern — flat list at root**

```csharp
// ❌ Flat list — works fine with 8 stations, silently loses stations 11+ on most head units
public override void OnLoadChildren(string parentId, Result result)
{
    var items = new List<MediaBrowserCompat.MediaItem>();
    foreach (var station in _stations)
        items.Add(CreateStation(station.Id, station.Name, station.Url));

    var javaList = new ArrayList();
    foreach (var item in items) javaList.Add(item);
    result.SendResult(javaList);
}
```

This works correctly in testing with a small list. It fails silently in production once the list exceeds the head unit's page size.

**The correct pattern — two-level browse hierarchy**

The reliable fix is not to implement pagination (which remains head-unit-dependent and requires testing on every target device), but to use a **two-level browse structure**: the root level contains a single browsable folder, and all stations live inside that folder.

Android Auto always loads the root level in full — the folder occupies one slot. When the user taps the folder, `OnLoadChildren` is called again with the folder's ID, and all stations are returned into that second level. Because the second-level call also pages at 10, large lists still benefit from pagination support in the second level — but crucially, users can always reach the folder and see all stations by scrolling within it.

```
Root (__ROOT__)
└── 📁 "All Stations"  ← FlagBrowsable — tapping this triggers OnLoadChildren(__ALL_STATIONS__)
    ├── 📻 Station 1   ← FlagPlayable
    ├── 📻 Station 2
    ├── ...
    └── 📻 Station 30
```

```csharp
private const string BrowseIdAllStations = "__ALL_STATIONS__";

public override void OnLoadChildren(string parentId, Result result)
{
    var mediaItems = new List<MediaBrowserCompat.MediaItem>();

    if (parentId == "__ROOT__")
    {
        // ✅ Root: one browsable folder — always visible regardless of page size
        var iconUri = Android.Net.Uri.Parse($"android.resource://{PackageName}/drawable/radio1");
        var categoryDesc = new MediaDescriptionCompat.Builder()
            .SetMediaId(BrowseIdAllStations)
            .SetTitle("All Stations")
            .SetSubtitle("Browse all radio stations")
            .SetIconUri(iconUri)
            .Build();
        mediaItems.Add(new MediaBrowserCompat.MediaItem(
            categoryDesc,
            MediaBrowserCompat.MediaItem.FlagBrowsable));
    }
    else if (parentId == BrowseIdAllStations)
    {
        // ✅ Category: all stations — returned in full; head unit pages them as needed
        lock (_queueGate)
        {
            _stations = LoadStationsFromFile();
            try { _mediaSession.SetQueue(BuildQueueItems(_stations)); } catch { }
        }
        for (int i = 0; i < _stations.Count; i++)
            mediaItems.Add(CreateStation(ToMediaId(i), _stations[i].Name, _stations[i].Url));
    }

    var javaList = new ArrayList();
    foreach (var item in mediaItems) javaList.Add(item);
    result.SendResult(javaList);
}
```

**Implementing the three-argument overload for head units that request explicit pagination**

Some head units call the three-argument version directly. To handle those correctly, override it and respect the page/size parameters:

```csharp
public override void OnLoadChildren(string parentId, Result result, Bundle options)
{
    int page = options?.GetInt(MediaBrowserCompat.ExtraPage, 0) ?? 0;
    int pageSize = options?.GetInt(MediaBrowserCompat.ExtraPageSize, int.MaxValue) ?? int.MaxValue;

    if (parentId == BrowseIdAllStations)
    {
        var allStations = LoadStationsFromFile();
        var paged = allStations
            .Skip(page * pageSize)
            .Take(pageSize)
            .ToList();

        var mediaItems = new List<MediaBrowserCompat.MediaItem>();
        for (int i = 0; i < paged.Count; i++)
        {
            int globalIndex = page * pageSize + i;
            mediaItems.Add(CreateStation(ToMediaId(globalIndex), paged[i].Name, paged[i].Url));
        }

        var javaList = new ArrayList();
        foreach (var item in mediaItems) javaList.Add(item);
        result.SendResult(javaList);
        return;
    }

    // Fall back to non-paginated overload for root and unknown IDs
    OnLoadChildren(parentId, result);
}
```

**Content style hints — grid vs list display**

Android Auto and AAOS support display hints that control whether items are shown as a grid (tiles) or a list. These are set via extras on the `BrowserRoot` returned from `OnGetRoot()`:

```csharp
// Values: 1 = list, 2 = grid
private const int ContentStyleList = 1;
private const int ContentStyleGrid = 2;

public override BrowserRoot OnGetRoot(string clientPackageName, int clientUid, Bundle rootHints)
{
    var extras = new Bundle();
    // Show browsable items (folders) as a list
    extras.PutInt("android.media.browse.CONTENT_STYLE_BROWSABLE_HINT", ContentStyleList);
    // Show playable items (stations) as a list
    extras.PutInt("android.media.browse.CONTENT_STYLE_PLAYABLE_HINT", ContentStyleList);
    return new BrowserRoot("__ROOT__", extras);
}
```

For a radio app where station names are the primary identifier, list style is more readable than grid. Grid works better when you have custom artwork per item.

**Summary — pagination rule**

| Scenario | Behavior without hierarchy fix | Behavior with two-level hierarchy |
|---|---|---|
| 8 stations | All 8 visible ✅ | All 8 visible ✅ |
| 12 stations | First 10 visible, 2 lost ❌ | Folder always visible; all 12 accessible inside ✅ |
| 50 stations | First 10 visible, 40 lost ❌ | Folder always visible; all 50 accessible, paged inside ✅ |

> **Testing tip:** Use the Android Auto Desktop Head Unit (DHU) emulator with a station list larger than 10 to reproduce the truncation. The DHU enforces the 10-item page limit by default and is the most reliable way to validate pagination behavior without a physical head unit.

#### Issue B: Circular navigation on Next/Previous

In the Android Auto interface, there is no visible end-of-list indicator. When your Next/Previous logic wraps from the last station back to the first (or vice versa), users have no way to know they've cycled. This is intentional app behavior for in-car use but non-obvious in the AA interface.

Document this in your `OnMediaButtonEvent` / queue management so future maintainers don't "fix" the wrap-around:

```csharp
private int GetNextStationIndex(int currentIndex)
{
    // Intentional circular wrap — there is no end-of-list indicator in Android Auto
    // Last station → wraps to first; First station ← wraps to last
    return (currentIndex + 1) % _stations.Count;
}
```

#### Issue C: AndroidX.Lifecycle version pinning

`MediaBrowserServiceCompat` via `Xamarin.AndroidX.Media` has deep transitive dependencies on AndroidX Lifecycle. NuGet's default dependency resolution pulls in conflicting versions of the Lifecycle sub-packages, causing build failures that look like `Duplicate class kotlin.collections.jdk8.*` or `Cannot resolve symbol 'LifecycleOwner'`.

The fix is to explicitly pin all Lifecycle packages in your `.csproj`. The full list of required package references with the correct versions is documented in the **Key Dependencies** section below.

#### Issue D: Media session stops responding

If your `MediaSession` token is not correctly connected to `MediaBrowserServiceCompat.SessionToken`, hardware media buttons (steering wheel controls, Bluetooth HID) stop working after the head unit's session timeout.

```csharp
public override void OnCreate()
{
    base.OnCreate();

    _mediaSession = new MediaSessionCompat(this, "RadioAndroidPRO");
    _mediaSession.SetCallback(new MediaSessionCallback(this));
    _mediaSession.SetFlags(
        MediaSessionCompat.FlagHandlesMediaButtons |
        MediaSessionCompat.FlagHandlesTransportControls);

    // ✅ This line is mandatory — connects session to browser service
    // Without it, AA and Bluetooth controls work initially but stop after inactivity
    SessionToken = _mediaSession.SessionToken;

    _mediaSession.IsActive = true;
}
```

---


### 5. AudioFocus and UI/Service State Synchronization

This is one of the hardest problems in Android audio development in general — and significantly harder in .NET MAUI than in Kotlin, where the platform provides first-class tools for exactly this scenario.

**The problem**

A radio app does not live in isolation. Android is a multitasking system and audio focus is a shared resource. At any moment, another app or the system itself can interrupt playback: an incoming SMS triggers a notification sound, Android Auto navigation starts speaking turn-by-turn directions, the user opens YouTube or another media player, a phone call arrives. Each of these events sends an AudioFocus signal to the app. The app must react correctly — pause or duck the volume — and then know when and whether to resume.

On top of that, the UI and the background service are separate components with separate lifecycles. The service runs continuously in the background. The UI can be destroyed and recreated at any time — the user switches to another app, the system kills the UI to reclaim memory, the screen rotates, the user taps the notification and returns to the app. Every time the UI comes back, it must reconnect to the service and restore the exact current state: which station is playing, whether it is paused, what the stream metadata shows. A stale or ghost UI state — showing "playing" when the service is paused, or the wrong station name — is a real bug that confuses users.

In Kotlin this is solved with LiveData, ViewModel, and the Android lifecycle architecture components — all designed to survive UI recreation and bind automatically to the service state. In MAUI none of this exists. The framework abstracts the platform, which means it also abstracts away these tools. Everything has to be built manually.

**AudioFocus handling — what must be covered**

Android sends different AudioFocus events depending on what is happening, and each requires a different response:

- `AUDIOFOCUS_LOSS` — another app has taken focus permanently (user started YouTube, a media player). The app must stop playback and not resume automatically. Resuming uninvited after the user chose another app is a serious UX violation.
- `AUDIOFOCUS_LOSS_TRANSIENT` — focus lost temporarily (phone call, navigation announcement). The app must pause and resume automatically when focus returns.
- `AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK` — another app needs audio briefly at low volume (notification sound). The app can reduce volume instead of pausing, then restore it.
- `AUDIOFOCUS_GAIN` — focus returned. The app must resume if it was paused due to a transient loss, but must not resume if the user stopped playback manually or if focus was lost permanently.

The critical distinction is between a user-initiated stop and a system-initiated pause. The reconnect logic and AudioFocus resume logic must never overlap — a user pressing Stop must always win, regardless of what AudioFocus signals arrive afterward.

**UI/Service synchronization — what must be covered**

When the UI is recreated or the user returns to the app, the following must all be restored correctly and instantly:

- Current playback state (playing, paused, stopped, reconnecting)
- Current station name and metadata (stream title, artist if available)
- Correct visual state of all controls (play button, station name, status text)
- Android Auto interface state — if the car head unit is connected, it has its own UI that must also reflect the current state

The synchronization must work in all entry points: the user taps the app icon, the user taps the persistent notification, the user returns from Android Auto, the user returns from another app. Each of these can trigger UI recreation with a different back stack state.

In MAUI the solution requires a shared state service (in this project `RadioStateService`) that acts as the single source of truth. The background service writes to it, the UI reads from it. The connection between the two must survive UI recreation without leaking memory or creating duplicate subscriptions. This means careful management of event subscriptions — subscribing when the page appears, unsubscribing when it disappears — and ensuring the state service itself is a singleton that outlives any individual page.

**Why this took a long time**

The interactions between AudioFocus events, reconnect logic, user-initiated stops, and UI lifecycle are a matrix of edge cases. Each combination has to behave correctly:

- User stops → navigation speaks → AudioFocus gain arrives → app must not resume
- Stream drops → reconnect starts → phone call arrives → reconnect must pause → call ends → reconnect resumes
- User pauses → switches to AA → AA shows paused state → user returns to phone → phone UI shows paused state
- App is in background → system kills UI → user taps notification → UI recreates → shows correct state immediately

None of these are handled by the framework. Each one is a deliberate decision in code.

---


### 5.1. Favorites — Multi-Surface State Synchronization

> **Status: private testing — not yet in the Google Play release.**
>
> The favorites feature is implemented and functional, but it is currently in private testing. The reason is the synchronization complexity documented in this section and section 6.2 — five separate surfaces that must all agree on the same state, across a background service, system notification, Android Auto queue, Bluetooth media session, and two UI pages, with no built-in platform mechanism to coordinate them. What looks like a simple star button turned out to require a significant amount of careful engineering to get right on all surfaces. It may be included in a future public release once testing across more devices is complete.

Favorites look simple from the outside: mark a station with a star, filter to show only favorites, navigate between them. The implementation turned out to be one of the more subtle synchronization problems in the app — touching five separate surfaces that all need to agree on the same state. This pattern applies to any MAUI app where a shared boolean state must be reflected across a background service, system notifications, and multiple UI pages simultaneously — and where the platform provides no built-in mechanism (like LiveData or ViewModel) to do it automatically.

**The five surfaces that consume favorite state**

| Surface | What it shows |
|---|---|
| Radio Page (player UI) | `★` indicator next to the station name when current station is a favorite; `☆/★` filter button to toggle favorites-only navigation |
| Stations List tab | Per-station `★` toggle button — the only place where favorites are added or removed |
| System notification popup | Station title prefixed with `★` when the currently playing station is a favorite |
| Android Auto queue | Queue filtered to favorites-only when the filter is active; falls back to full list if no favorites exist |
| Bluetooth / lockscreen media session | Title metadata prefixed with `★` |

**The split of responsibilities — why it matters**

The player UI star button is **filter-only** — it controls whether Prev and Next navigate only through favorite stations. It does **not** add or remove favorites. That action lives exclusively in the station list, where each station has its own toggle. This separation was a deliberate UX decision: conflating "filter" and "edit" into the same button on the player screen caused confusion about what the button actually did.

The consequence: when the filter is ON, drag-and-drop reordering in the station list is disabled. Reordering while filtered would save stations in filtered order, destroying the positions of non-favorite stations.

**Stale state problem**

The station list is held in memory in both the UI and the background service. If the user edits favorites and then navigates or starts playback, the in-memory list may have stale favorite values. The fix: every component that consumes favorite state always reloads the station list from the persisted store before acting on it — the UI before navigation, the service before rebuilding the queue, the notification layer before rendering the title.

**Empty favorites fallback**

When the filter is ON but no station is marked as a favorite, Prev/Next fall back silently to the full list. Without this fallback, enabling the filter with zero favorites would produce a dead end the user could not escape without turning the filter off.

**Single source of truth**

A shared `CurrentStationIsFavorite` flag is the signal between the UI, the service, and the notification layer. It is set fresh from the reloaded station list on every playback start and every queue rebuild. No surface reads favorite state directly from persistent storage at render time — they all read from the shared flag.

**Filter state persistence**

The filter toggle state is persisted so it survives app restarts. The player page restores it before the first UI update — so the filter button reflects the last-used state immediately, without a flicker.

---


### 5.2. Android Auto + Favorites — Synchronization Problem and Solution

Android Auto is the surface where the favorites filter was hardest to get right. Unlike the phone UI — where toggling the filter simply re-filters an in-memory list — AA has its own lifecycle and its own model for displaying and highlighting media content. Every surface involved (queue list, active item highlight, filter toggle) required a separate fix.

**Why AA is different from Bluetooth and system notification**

Bluetooth metadata and the system notification popup are push-only: the app sets the value once and the system renders it. If you call `SetMetadata()` or rebuild the notification, the change appears immediately.

Android Auto is pull-based: AA requests the queue by calling `OnLoadChildren()`, and it requests the active item from `PlaybackState.activeQueueItemId`. The app cannot push content into AA directly — it can only tell AA that something changed and wait for AA to pull the new state. This distinction is what caused the symptoms: Bluetooth and the notification reflected favorites changes instantly, while AA remained stale because no one told it to re-request the queue.

**Three bugs found and fixed**

**Bug 1 — `OnLoadChildren` ignored the favorites filter**

`OnLoadChildren` is called by AA when it opens or refreshes the station list. The original implementation always returned the full list of stations, regardless of whether the favorites filter was on. AA would show all stations even when the filter was active.

Fix: `OnLoadChildren` now respects the filter state and returns only favorite stations when the filter is on. Fallback to the full list if the filter is on but no stations are favorited (same rule as the phone UI).

**Bug 2 — active item highlight used the wrong index**

AA highlights the currently playing row using an item ID from `PlaybackState`. The original code passed the station's position in the full list. When the favorites filter was on, the displayed queue had fewer items — AA could not find the full-list index in the shorter queue and showed no highlight at all.

Fix: the active item ID is now always computed relative to the *displayed* (filtered or full) queue — not the full station list. It is recalculated in every place that builds the queue so it stays correct across navigation and filter changes.

**Bug 3 — filter toggle did not notify AA to re-request the queue**

When the user toggled the favorites filter, the phone UI re-filtered correctly. But AA was not told to call `OnLoadChildren` again. The result: AA kept showing the old queue until the user navigated away and back.

Fix: every filter toggle and every favorites add/remove now sends a signal to the foreground service, which calls `NotifyChildrenChanged()`. AA receives this signal and re-requests the queue, now getting the correctly filtered list.

**Scenario table**

| Scenario | Before fix | After fix |
|---|---|---|
| Open AA with filter ON | Full list shown | Filtered list shown |
| Toggle filter ON from player screen | AA still shows full list | AA refreshes and shows filtered list |
| Toggle filter ON from station list | AA still shows full list | AA refreshes and shows filtered list |
| Add a station to favorites while filter is ON | AA list does not update | AA refreshes and shows updated filtered list |
| Remove a station from favorites while filter is ON | AA list does not update | AA refreshes, station disappears from list |
| Play station, then toggle filter | Active highlight disappears or points to wrong row | Active highlight stays on the correct row |
| Skip Next/Previous via AA while filter is ON | Active highlight shows wrong station | Active highlight moves to the correct next/previous station |
| Tap a station in AA list while filter is ON | Correct station plays but wrong row highlighted | Correct station plays and correct row highlighted |
| Filter ON but no favorites exist | AA shows empty queue | AA falls back to full list (same as phone UI) |

---


### 6. LibVLCSharp Memory Safety Checklist

This checklist consolidates the native memory safety rules from sections 1 and 2 into a single quick-reference for code reviews and new contributors. Every rule here has a corresponding crash or deadlock in the project's history.

**Threading rules — VLC event callbacks**

| Rule | Why |
|---|---|
| Never call `Stop()`, `Play()`, or `Media = X` inside a VLC event handler | VLC holds native mutexes during event dispatch — re-entry deadlocks the engine permanently |
| Always dispatch to thread pool first: `Task.Run(() => ...)` or `ThreadPool.QueueUserWorkItem` | Gets off the native pthread before any VLC call |
| Never dispatch to UI thread as a substitute — call VLC from UI thread only if no VLC event is in progress | UI thread dispatch does not release the native mutex |
| `Playing`, `Paused`, `Stopped` callbacks may run directly only if they make **no VLC calls** | State-read-only callbacks are safe; any VLC method call is not |

**Native memory rules — Media object lifecycle**

| Rule | Why |
|---|---|
| Cancel `_metaPollCts` before `Media = null` | Polling loop holds a reference to native media memory; cancelling stops access before free |
| Detach `MetaChanged` event handler before `Media = null` | Event handler fired after free = SIGSEGV |
| Null `_currentMediaForMeta` before `Media = null` | Prevents any deferred access via cached reference |
| `Thread.Sleep(50)` after cancel, before free | LibVLC has a known native micro-freeze during teardown; 50ms lets the polling loop observe cancellation before native memory is released |
| Call `oldMedia?.Dispose()` explicitly after `Media = null` | GC does not manage native memory — dispose must be explicit |
| Never access `Media.Meta()` after `MediaPlayer.Media` has been replaced or nulled | The C# wrapper may be non-null while native memory is already freed |

**Cleanup ordering — must be followed in every reset path**

This sequence must be applied in `PlayRadio`, `StopRadio`, `HardResetVlc`, and `OnDestroy`:

```
1. _metaPollCts?.Cancel()                    ← stop polling
2. _currentMediaForMeta.MetaChanged -= ...   ← detach handler
3. _currentMediaForMeta = null               ← clear cached ref
4. Thread.Sleep(50)                          ← wait for native teardown
5. MediaPlayer.Stop()                        ← stop engine
6. var old = MediaPlayer.Media
7. MediaPlayer.Media = null                  ← free native memory
8. old?.Dispose()                            ← explicit native dispose
```

**Play→Stop→Play race guard**

| Rule | Why |
|---|---|
| Check `lock (_commandGate) { if (_isStartingPlayback) return; }` inside the `Stopped` callback | Late VLC `Stopped` events arrive after new playback has already started — without the guard they reset `IsPlaying = false` and corrupt new playback state |
| Set `_isStartingPlayback = true` before `Play()`, clear it after the Playing event fires | Marks the window during which late Stopped events must be ignored |

**Quick diagnostic — which crash pattern is which**

| Symptom | Likely cause | Section |
|---|---|---|
| App freezes, no crash, no log, audio thread stuck | VLC deadlock — VLC method called inside event handler | §1 |
| `SIGSEGV` in native LibVLC stack, intermittent | Use-after-free — Media accessed after `Media = null` | §2 |
| `ForegroundServiceDidNotStartInTimeException` on Android 12 | `StartForeground()` not called immediately in `OnStartCommand` | §3 |
| Play→Stop→Play: second Play shows stopped state | Late `Stopped` event — missing `_isStartingPlayback` guard | §2 |
| Metadata shows stale station name after switch | `_currentMediaForMeta` not nulled before switch | §2 |

---

### 7. VLC Equalizer in .NET MAUI (LibVLCSharp)

**Equalizer support in LibVLCSharp is functional but not fully documented.**
Below is a practical guide for integrating and controlling the VLC equalizer in a .NET MAUI application.

#### How it works

LibVLC exposes the equalizer API via the `AudioEqualizer` and `MediaPlayer` classes. You can create an equalizer, set band gains, and assign it to the player.

#### Example: Configuring the equalizer (9 bands in the UI, up to 10 supported by VLC)

```csharp
using LibVLCSharp.Shared;

// Create equalizer instance
var equalizer = new AudioEqualizer();

// Set gain for each band (example values)
equalizer.SetAmp(0, 3.0f); // Band 0: +3dB
equalizer.SetAmp(1, -2.0f); // Band 1: -2dB
// ... repeat for other bands as needed

// Optionally set preamp
equalizer.Preamp = 0.0f;

// Assign equalizer to MediaPlayer
mediaPlayer.SetEqualizer(equalizer);

// To disable equalizer:
mediaPlayer.SetEqualizer(null);
```

#### Practical notes

- Band count and frequencies: Use `AudioEqualizer.BandCount` and `AudioEqualizer.GetBandFrequency(int band)` to query available bands and their frequencies.
- You can create a custom UI (e.g. sliders) in MAUI and bind their values to `SetAmp(band, gain)`.
- The equalizer can be changed at runtime; changes take effect immediately.
- Always check for nulls and handle exceptions, especially when switching streams or disposing the player.

#### Example: Displaying band frequencies

```csharp
for (int i = 0; i < AudioEqualizer.BandCount; i++)
{
    float freq = AudioEqualizer.GetBandFrequency(i);
    Console.WriteLine($"Band {i}: {freq} Hz");
}
```

**Tip:** Integrate equalizer controls in `EditStationPage.xaml` or a dedicated settings page for user adjustment.

**Reference:** [LibVLCSharp AudioEqualizer API](https://code.videolan.org/videolan/LibVLCSharp/-/blob/master/LibVLCSharp/AudioEqualizer.cs)

---


### 8. AAOS Album Art

**The symptom**

The app shows the default album art icon correctly on Bluetooth devices (car head units, speakers, headphones) and on Android Auto. The same icon is completely missing on Android Automotive OS — the media card shows a blank/placeholder image instead of the app icon. No crash, no error in logs. The icon is simply not displayed.

**The root cause**

Bluetooth and Android Auto read album art from `MediaMetadataCompat` using the **Bitmap** fields — `MetadataKeyAlbumArt` and `MetadataKeyDisplayIcon`. You set a `Bitmap` object via `PutBitmap()`, and both BT and AA render it correctly. This is the pattern shown in every MediaSession example online.

AAOS ignores Bitmap fields entirely. The AAOS media UI runs in a separate system process (`com.android.car.media`) and resolves album art exclusively through **URI fields** — `MetadataKeyAlbumArtUri`, `MetadataKeyArtUri`, `MetadataKeyDisplayIconUri`. If no URI is set, AAOS shows nothing, regardless of how many Bitmap fields you populate.

This is not documented in a single clear place. The Android developer docs mention URI-based metadata as an alternative, but do not state that AAOS requires it. If you are porting a working AA/BT app to Automotive and your album art disappears, this is almost certainly the reason.

**The wrong pattern — works on BT and AA, fails on AAOS**

```csharp
// ❌ Bitmap-only — BT and AA display it, AAOS ignores it
var bitmap = BitmapFactory.DecodeResource(Resources, Resource.Drawable.radio1);
var metadata = new MediaMetadataCompat.Builder()
    .PutString(MediaMetadataCompat.MetadataKeyTitle, stationName)
    .PutString(MediaMetadataCompat.MetadataKeyArtist, artist)
    .PutBitmap(MediaMetadataCompat.MetadataKeyAlbumArt, bitmap)
    .Build();
_mediaSession.SetMetadata(metadata);
```

**The correct pattern — works on BT, AA, and AAOS**

Set both Bitmap (for BT/AA) and URI (for AAOS). The URI must use the `android.resource://` scheme with the **type/name** format, not the integer resource ID format.

```csharp
// ✅ Bitmap + URI — covers all three platforms
var bitmap = BitmapFactory.DecodeResource(Resources, Resource.Drawable.radio1);
var artUri = $"android.resource://{PackageName}/drawable/radio1";

var metadata = new MediaMetadataCompat.Builder()
    .PutString(MediaMetadataCompat.MetadataKeyTitle, stationName)
    .PutString(MediaMetadataCompat.MetadataKeyArtist, artist)
    // Bitmap — for Bluetooth and Android Auto
    .PutBitmap(MediaMetadataCompat.MetadataKeyAlbumArt, bitmap)
    .PutBitmap(MediaMetadataCompat.MetadataKeyDisplayIcon, bitmap)
    // URI — for AAOS (resolves cross-process via ContentResolver)
    .PutString(MediaMetadataCompat.MetadataKeyAlbumArtUri, artUri)
    .PutString(MediaMetadataCompat.MetadataKeyArtUri, artUri)
    .PutString(MediaMetadataCompat.MetadataKeyDisplayIconUri, artUri)
    .Build();
_mediaSession.SetMetadata(metadata);
```

**URI format matters**

There are two `android.resource://` URI formats:

| Format | Example | AAOS |
|---|---|---|
| Integer resource ID | `android.resource://com.myapp/2131230856` | ❌ Some AAOS builds fail to resolve this |
| Type/name | `android.resource://com.myapp/drawable/radio1` | ✅ Works reliably across AAOS builds |

Always use the `type/name` format. The integer format is technically valid but has been observed to fail on certain AAOS emulator builds and real car head units.

**Browse tree and queue — also need URIs**

The MediaSession metadata fix covers the "now playing" screen. But AAOS also displays station icons in the **browse tree** (from `OnLoadChildren`) and in the **queue**. These are separate `MediaDescriptionCompat` objects and must also carry the icon URI:

```csharp
// Browse tree items (OnLoadChildren → CreateStation)
var iconUri = $"android.resource://{PackageName}/drawable/radio1";
var metadata = new MediaMetadataCompat.Builder()
    .PutString(MediaMetadataCompat.MetadataKeyMediaId, id)
    .PutString(MediaMetadataCompat.MetadataKeyTitle, name)
    .PutString(MediaMetadataCompat.MetadataKeyMediaUri, url)
    .PutString(MediaMetadataCompat.MetadataKeyAlbumArtUri, iconUri)
    .PutString(MediaMetadataCompat.MetadataKeyDisplayIconUri, iconUri)
    .Build();
return new MediaBrowserCompat.MediaItem(
    metadata.Description,
    MediaBrowserCompat.MediaItem.FlagPlayable);

// Queue items (BuildQueueItems)
var iconAndroidUri = Android.Net.Uri.Parse(
    $"android.resource://{PackageName}/drawable/radio1");
var desc = new MediaDescriptionCompat.Builder()
    .SetMediaId(mediaId)
    .SetTitle(stationName)
    .SetMediaUri(Android.Net.Uri.Parse(streamUrl))
    .SetIconUri(iconAndroidUri)
    .Build();
```

**Notification large icon**

Some AAOS implementations also fall back to the notification's large icon when MediaSession metadata has no resolvable art. Adding `SetLargeIcon(bitmap)` to the `Notification.Builder` provides an additional safety net:

```csharp
var builder = new Notification.Builder(this, channelId)
    .SetContentTitle(title)
    .SetSmallIcon(Resource.Mipmap.appicon)
    .SetLargeIcon(bitmap)  // ← AAOS fallback
    .SetStyle(new Notification.MediaStyle()
        .SetMediaSession(sessionToken));
```

**Summary — the full AAOS icon checklist**

| Where | What to set | Why |
|---|---|---|
| `MediaMetadataCompat` (now playing) | `PutBitmap` + `PutString` for all three URI keys | BT/AA use Bitmap, AAOS uses URI |
| `OnLoadChildren` items (browse tree) | `MetadataKeyAlbumArtUri` + `MetadataKeyDisplayIconUri` | AAOS station list icons |
| Queue items | `SetIconUri()` on `MediaDescriptionCompat` | AAOS queue view |
| Notification | `SetLargeIcon(bitmap)` | Fallback for AAOS builds that check notification art |
| URI format | `android.resource://package/drawable/name` (type/name) | Reliable cross-process resolution |

> **If you are porting from Android Auto to AAOS:** The most common mistake is assuming that if album art works on AA, it will work on AAOS. It will not. AA reads Bitmap, AAOS reads URI. You must set both. This applies to every `MediaMetadataCompat` and every `MediaDescriptionCompat` in your browse tree, queue, and now-playing metadata.

---


### 9. Google Play AAOS Distribution — Why the APK Works but the Store Rejects It

**The situation**

The app runs correctly on an AAOS emulator. A manually sideloaded APK works on a real car head unit. Yet Google Play Console rejects the submission — the pre-launch report either fails the automotive review, the app is blocked from the AAOS track, or the store never surfaces it on automotive devices. No crash, no runtime error. Everything functional. Just a blocked store listing.

This is a common experience for developers porting .NET MAUI apps to AAOS. The reason is that **Google Play has a separate and strict requirements layer for AAOS distribution** that is entirely independent of whether the app works at runtime. The APK/AAB is validated against a checklist of metadata, manifest declarations, and structural requirements before it is ever installed or tested on a real device. If any item is missing, the submission is rejected silently or the app simply does not appear on the automotive track.

This section documents every known requirement that must be satisfied for a .NET MAUI media app to pass Google Play's AAOS review.

---

#### Requirement 1: `automotive_app_desc.xml` — the mandatory automotive descriptor

Google Play requires a descriptor XML file that explicitly declares the app as an automotive media app. Without this file, the app will not be approved for the automotive track regardless of how well it works.

Create `Platforms/Android/Resources/xml/automotive_app_desc.xml`:

```xml
<automotiveApp>
    <uses name="media" />
</automotiveApp>
```

In .NET MAUI this file must be placed under `Platforms/Android/Resources/xml/`. The build system will package it as `res/xml/automotive_app_desc.xml` in the APK/AAB. Verify it is present in the output APK by unpacking it with `apktool` or inspecting the AAB with `bundletool`.

---

#### Requirement 2: `AndroidManifest.xml` — the full set of automotive declarations

A functioning manifest for phone-only AA is not sufficient for AAOS Play distribution. The following additions are all required:

**a) `<meta-data>` linking to the automotive descriptor**

Inside the `<application>` element:

```xml
<meta-data
    android:name="com.google.android.gms.car.application"
    android:resource="@xml/automotive_app_desc" />
```

This is the entry point Google Play uses to identify and validate the automotive descriptor. If this `<meta-data>` is missing, the store treats the app as non-automotive regardless of any other declarations.

**b) `<uses-feature>` for the automotive hardware type**

```xml
<uses-feature
    android:name="android.hardware.type.automotive"
    android:required="false" />
```

`required="false"` is mandatory if the same APK/AAB targets both phones and cars. Setting `required="true"` restricts the app to automotive devices only — which is intentional only if you publish a separate automotive-only build. For a universal build, always use `false`.

**c) `MediaBrowserService` intent filter — the correct form**

The service declaration must include the `android.media.browse.MediaBrowserService` action. This is what the AAOS media framework uses to discover your service. A service that only has the AA intent filter (`android.media.browse.MediaBrowserService` was historically sometimes listed differently) will be found by Android Auto but silently ignored by AAOS.

```xml
<service
    android:name="com.yourpackage.AudioPlaybackService"
    android:exported="true"
    android:foregroundServiceType="mediaPlayback"
    android:permission="android.permission.BIND_MEDIA_BROWSER_SERVICE">
    <intent-filter>
        <action android:name="android.media.browse.MediaBrowserService" />
    </intent-filter>
</service>
```

The `android:permission="android.permission.BIND_MEDIA_BROWSER_SERVICE"` attribute is required — it ensures only the system and authorized callers can bind to your service. Without it, the AAOS system media framework may refuse the binding.

**d) Complete manifest example with all automotive additions**

```xml
<manifest ...>

    <uses-feature
        android:name="android.hardware.type.automotive"
        android:required="false" />

    <application ...>

        <!-- Automotive descriptor link — required by Google Play -->
        <meta-data
            android:name="com.google.android.gms.car.application"
            android:resource="@xml/automotive_app_desc" />

        <!-- MediaBrowserService — required for AAOS + Android Auto -->
        <service
            android:name="com.yourpackage.AudioPlaybackService"
            android:exported="true"
            android:foregroundServiceType="mediaPlayback"
            android:permission="android.permission.BIND_MEDIA_BROWSER_SERVICE">
            <intent-filter>
                <action android:name="android.media.browse.MediaBrowserService" />
            </intent-filter>
        </service>

    </application>
</manifest>
```

---

#### Requirement 3: AAB (Android App Bundle) — not APK

Google Play requires AAB format for new submissions since August 2021. Sideloaded APKs bypass this — which is why the APK works but the Play submission fails.

In Visual Studio / .NET MAUI, publish as AAB:

```
dotnet publish -f net10.0-android -c Release /p:AndroidPackageFormat=aab
```

Or set in the `.csproj`:

```xml
<PropertyGroup Condition="'$(Configuration)' == 'Release'">
    <AndroidPackageFormat>aab</AndroidPackageFormat>
</PropertyGroup>
```

Verify the AAB contains the automotive resources by inspecting it with `bundletool`:

```bash
bundletool dump resources --bundle=app.aab --resource=xml/automotive_app_desc
```

---

#### Requirement 4: `targetSdkVersion` and `minSdkVersion`

For AAOS distribution, Google Play enforces:

- `targetSdkVersion` must be recent — currently 33 or higher is required for new submissions (Google advances this annually; check the Play Console for the current requirement)
- `minSdkVersion` for AAOS: the minimum API level for AAOS is **23** (Android 6.0), but practical AAOS devices start at **API 28** (Android 9). Setting `minSdkVersion="28"` covers all real AAOS hardware while keeping the app installable on phones running Android 9+.

In `.csproj`:

```xml
<PropertyGroup>
    <ApplicationId>com.yourpackage.radioandroid</ApplicationId>
    <SupportedOSPlatformVersion>28</SupportedOSPlatformVersion>
    <TargetSdkVersion>36</TargetSdkVersion>
</PropertyGroup>
```

---

#### Requirement 5: `onGetRoot()` must handle AAOS callers

Google Play's pre-launch robot connects to the `MediaBrowserService` programmatically and calls `onGetRoot()`. If your implementation denies unknown package names or returns `null` for AAOS system packages, the automated review fails.

The AAOS media framework connects from the package `com.android.car.media`. Your `OnGetRoot()` must allow it:

```csharp
public override BrowserRoot OnGetRoot(string clientPackageName, int clientUid, Bundle rootHints)
{
    // Allow AAOS media framework and Android Auto
    // Do not whitelist-only known packages — the review robot uses its own package name
    return new BrowserRoot(MediaRoot, null);
}
```

If you have a package whitelist (only allow your own app, Google's AA host, etc.), the automated pre-launch review will be rejected because the test runner's package name is not on your list. Either remove the whitelist entirely or add a fallback that returns a valid root for unknown callers rather than returning `null`.

---

#### Requirement 6: `OnLoadChildren()` must return results synchronously (or signal completion)

The Play review robot calls `OnLoadChildren()` and expects a result within a timeout. If your implementation defers the result and never calls `result.SendResult()` (or calls it too late), the review times out and the submission fails.

Always call `result.SendResult()` on every code path in `OnLoadChildren()`:

```csharp
public override void OnLoadChildren(string parentId, Result result)
{
    var items = BuildStationList(); // synchronous preferred
    result.SendResult(new JavaList<MediaBrowserCompat.MediaItem>(items));
}
```

If you defer with `result.Detach()` for async loading, you must call `result.SendResult()` even on error paths — a `null` result signals "no items" cleanly; never leave the result unsent.

---

#### Requirement 7: Separate AAOS track in Play Console (optional but recommended)

Google Play Console supports a dedicated **Automotive OS** track separate from the phone track. Publishing to this track allows Google's team to test the automotive-specific flows without impacting the phone release. For a media app, this also unlocks the AAOS-specific pre-launch report which shows detailed results from the AAOS emulator.

To target this track, the AAB must have `android.hardware.type.automotive` declared (Requirement 2b) and the automotive descriptor (Requirement 1). A single universal AAB can cover both tracks — the same binary is distributed to phones and cars.

---

#### Why this is harder in .NET MAUI than in Kotlin

In a native Kotlin/Gradle project, the Android Studio "Automotive" template adds all of the above automatically: the descriptor XML, the manifest entries, the correct service declaration, the `targetSdkVersion` — all pre-configured and validated by the IDE. Android Studio warns you at build time if anything is missing.

In .NET MAUI, none of this is automated. The MAUI tooling knows nothing about automotive. Every manifest entry, every XML resource, every packaging flag is the developer's responsibility. There is no "automotive" template, no lint warning for a missing descriptor, no IDE validation. The first sign that something is missing is a Play Console rejection — after an upload, a signing and alignment pass, and a manual review queue wait.

The requirements listed in this section were discovered through that process — not through documentation, but through rejections.

---

#### AAOS Distribution Checklist

| # | Requirement | File / Location | Common mistake |
|---|---|---|---|
| 1 | `automotive_app_desc.xml` exists | `Platforms/Android/Resources/xml/` | Missing entirely — not generated by MAUI tooling |
| 2a | `<meta-data com.google.android.gms.car.application>` | `AndroidManifest.xml` → `<application>` | Missing `<meta-data>` even when XML exists |
| 2b | `<uses-feature android.hardware.type.automotive required="false">` | `AndroidManifest.xml` | `required="true"` blocks phone installs |
| 2c | `MediaBrowserService` has `BIND_MEDIA_BROWSER_SERVICE` permission | `AndroidManifest.xml` → `<service>` | Permission omitted — AAOS refuses binding |
| 3 | Published as AAB, not APK | `.csproj` / publish command | APK works locally, AAB required for Play |
| 4 | `targetSdkVersion` ≥ 33 | `.csproj` | Outdated target SDK blocks submission |
| 5 | `OnGetRoot()` returns valid root for any caller | `AudioPlaybackService.cs` | Package whitelist blocks review robot |
| 6 | `OnLoadChildren()` always calls `SendResult()` | `AudioPlaybackService.cs` | Deferred result times out in review |
| 7 | Automotive track created in Play Console | Google Play Console | App published only to phone track |

---


### 10. Android Automotive OS — Why the Port Was Abandoned (Automotive Content Policy)

Meeting all the technical requirements documented in section 8 above — the descriptor file, the manifest declarations, the correct `MediaBrowserService` binding, the AAB format, the URI-based album art — is necessary but not sufficient for passing Google Play's AAOS certification.

**The blocking constraint is not technical. It is a UI policy requirement specific to Automotive OS.**

#### Why Android Auto passes but AAOS does not

The app ships with **four built-in starter stations** that are always present on a fresh install. This is enough for Android Auto certification — the browsable content tree is not empty, the review robot finds stations in `OnLoadChildren`, and the AA review passes.

Android Auto also operates in a fundamentally different model: the media app runs on the **user's phone**, and the head unit is a display client. Content management — adding stations, editing URLs — happens on the phone screen, outside driving mode. AA policy allows this because the interaction takes place on the companion device, not on the car's display.

Android Automotive OS is different. AAOS is a **standalone system** built into the car — there is no companion phone. Every user interaction happens on the car's screen, and every action is therefore subject to the Automotive UI restrictions that apply while the vehicle is in motion.

#### The blocking AAOS UI policy

Google's Automotive UI guidelines prohibit, while the vehicle is moving:

- **Text input of any kind** — no keyboards, no URL fields, no search boxes
- **Complex navigation flows** — no action that requires more than two taps to reach
- **Setup or configuration actions** — no flows that require the user to provide data

Adding a station in RadioAndroid requires typing a station name and a stream URL. This is the core user action the app is built around. On AAOS, this action is categorically prohibited by policy. There is no compliant way to implement it on the car's screen.

#### Why the four starter stations do not solve it

The four default stations satisfy the "content present at install" requirement and are enough to pass the AA review. They do not satisfy the AAOS requirement because:

- AAOS certification reviewers evaluate whether the app's primary functionality is accessible on the car screen in a policy-compliant way — not just whether something plays
- A user who wants to listen to any station outside those four defaults has no compliant path to add it on AAOS
- The app's value proposition — *play any internet radio stream you choose* — is irreconcilable with a policy that prohibits the input actions needed to choose a stream

**Conclusion: the port to Android Automotive OS was abandoned.**

The app functions correctly on AAOS at a technical level — playback, media session, browse tree, album art, notifications all work. A sideloaded APK runs on a real car head unit without issues. But the app cannot be published to the Google Play Automotive track because the Automotive Android content policy makes the app's core feature — adding user-defined stations — impossible to implement in a compliant way on the car screen.

| Requirement | Android Auto | Android Automotive OS |
|---|---|---|
| Browsable content present at install | ✅ Four starter stations | ✅ Four starter stations |
| Content management (adding stations) | ✅ Done on phone screen — outside driving mode | ❌ Must happen on car screen — text input prohibited |
| User can access any stream they choose | ✅ Add stations on phone, play in car | ❌ No compliant way to add stations on AAOS screen |
| Certification result | ✅ Passed Google Play AA review | ❌ Port abandoned — policy incompatibility |

The AAOS-specific technical work documented in sections 7 and 8 of this README — Album Art URI handling, automotive descriptor, `OnGetRoot()` and `OnLoadChildren()` implementation — remains in the codebase and functions correctly. The blocker is not the code. It is the policy.

A workaround would require either a server-side station catalog (turning the app into a service with its own backend) or restricting the app to a fixed built-in list with no user additions. Both fundamentally change what the app is. That trade-off was not accepted.

---


---

## 🏗 Architecture

### System Layers

```
┌──────────────────────────────────────────────────────────────┐
│                        UI Layer                             │
│  - RadioPage.xaml, StacjePage.xaml                           │
│  - EditStacjaPage.xaml, EditStationPage.xaml                  │
│  - User interaction: Play, Stop, Next, Prev, station select  │
└───────────────▲──────────────────────────────────────────────┘
                │
                │  (user commands)
                ▼
┌──────────────────────────────────────────────────────────────┐
│                App Logic / MVVM Layer                       │
│  - RadioStateService.cs, StacjaService.cs, SettingsService  │
│  - Holds playback state, playlist, settings                 │
└───────────────▲──────────────────────────────────────────────┘
                │
                │  (state changes, notifications)
                ▼
┌──────────────────────────────────────────────────────────────┐
│                Playback Service Layer                       │
│  - AudioPlaybackService.cs (+ partials)                     │
│  - Responsible for:                                         │
│    • Playback (LibVLC)                                      │
│    • Foreground Service (Android)                           │
│    • Android Auto, BT, notifications                        │
│    • Watchdog, reconnect, cellular fallback                 │
└───────────────▲──────────────────────────────────────────────┘
                │
                │  (playback commands)
                ▼
┌──────────────────────────────────────────────────────────────┐
│                  LibVLC Engine Layer                        │
│  - LibVLCSharp, VideoLAN.LibVLC.Android                     │
│  - Native audio streaming, buffering, decoding              │
└──────────────────────────────────────────────────────────────┘
```

### Stability & Protection Mechanisms

| Mechanism | What it protects against |
|---|---|
| **Watchdog** | Silent VLC hangs — detects no audio activity, triggers reset |
| **Reconnect Loop** | Network loss — retries playback with exponential backoff |
| **Cellular Fallback** | Dead Wi-Fi uplink — binds to mobile data, returns when Wi-Fi recovers |
| **Safe Threading** | Native deadlocks — VLC callbacks that trigger VLC methods dispatched to ThreadPool |
| **Native Memory Safety** | SIGSEGV crashes — polling and Media refs cancelled before freeing native memory |
| **Foreground Service Protection** | Android 12 ANR — immediate `StartForeground` on every `OnStartCommand` |
| **MVVM State Sync** | Ghost UI state — UI always reflects real playback state |

### File Structure

```
RadioAndroid/
├── RadioAndroid/
│   ├── App.xaml                — MAUI app definition
│   ├── App.xaml.cs             — App startup logic
│   ├── MainPage.xaml           — Main shell/page
│   ├── MainPage.xaml.cs        — Main page logic
│   ├── Views/
│   │   ├── RadioPage.xaml          — Main player UI
│   │   ├── RadioPage.xaml.cs       — Main player logic
│   │   ├── StacjePage.xaml         — Station list (list + favorites filter)
│   │   ├── StacjePage.xaml.cs      — Station list logic (add/remove favorites, reorder, drag-drop)
│   │   ├── EditStacjaPage.xaml     — Single station edit form (name + URL)
│   │   ├── EditStacjaPage.xaml.cs  — Single station edit logic (Save / Delete)
│   │   ├── EditStationPage.xaml    — Playlist Save/Load (JSON + PLS) + 9-band EQ
│   │   ├── EditStationPage.xaml.cs — Playlist and EQ logic
│   │   ├── HelpPage.xaml           — User guide
│   │   └── HelpPage.xaml.cs        — User guide logic
│   ├── Services/
│   │   ├── RadioStateService.cs    — Shared playback/favorites state (INotifyPropertyChanged)
│   │   ├── StacjaService.cs        — Station selection event bridge (UI → service)
│   │   └── SettingsService.cs      — Persisted user settings (JSON-backed)
│   ├── Models/
│   │   ├── Stacja.cs               — Station model (name + URL + IsFavorite)
│   │   └── StacjaViewModel.cs      — ViewModel for station list binding
│   └── Helpers/
│       ├── ToastHelper.cs          — Native Android toast wrapper
│       └── PlaybackHelper.cs       — Playback utility methods (AA queue refresh, etc.)
├── Platforms/Android/
│   ├── AudioPlaybackService.cs           — Main service (partial class)
│   ├── AudioPlaybackService.Playback.cs  — Play/Stop/Pause/HardReset, equalizer
│   ├── AudioPlaybackService.Media.cs     — VLC events, notifications, metadata
│   ├── AudioPlaybackService.Reconnect.cs — Reconnect loop, connectivity, cellular
│   ├── AudioPlaybackService.Queue.cs     — Next/Prev/queue management
│   ├── AudioPlaybackService.Callbacks.cs — MediaSession + AudioFocus
│   ├── AudioPlaybackService.Cellular.cs  — Cellular fallback, WiFi recovery monitor
│   ├── AudioPlaybackService.Watchdog.cs  — Watchdog timer, VLC activity tracking
│   └── AndroidManifest.xml               — Android app manifest (permissions, features)
└── RadioAndroid.csproj                   — .NET MAUI project file (dependencies, config)
```

The `AudioPlaybackService` is a `partial class` split across 8 files by responsibility. This keeps each file focused and manageable while sharing state through the service instance.

| File | Responsibility |
|---|---|
| `AudioPlaybackService.cs` | Service lifecycle, `OnCreate`, `OnStartCommand`, `OnDestroy`, `OnLoadChildren` |
| `AudioPlaybackService.Playback.cs` | `PlayRadio`, `StopRadio`, `PauseRadio`, `HardResetVlc`, equalizer |
| `AudioPlaybackService.Reconnect.cs` | Reconnect loop, exponential backoff, connectivity events |
| `AudioPlaybackService.Media.cs` | VLC event handlers, metadata polling, notifications |
| `AudioPlaybackService.Queue.cs` | Station queue, Next/Previous, `PlayFromQueueIndex` |
| `AudioPlaybackService.Callbacks.cs` | `AudioFocusChangeListener`, `RadioMediaSessionCallback` |
| `AudioPlaybackService.Cellular.cs` | Cellular fallback, WiFi recovery monitor, HTTP probe |
| `AudioPlaybackService.Watchdog.cs` | Watchdog timer, VLC activity tracking |

Splitting the service was not just an organizational choice — it was a response to a real problem. A single large service class with all responsibilities mixed together made it extremely difficult to track object lifetimes and spot memory leaks. Background services on Android are long-lived; they run for hours. Any object that is not properly disposed, any event subscription that is not unsubscribed, any reference that is held longer than necessary will accumulate. In a long-running audio service this shows up as gradual memory growth, eventually causing the system to kill the process.

Separating playback logic, reconnect logic, media session callbacks, queue management, cellular fallback, watchdog, and notification handling into distinct files made it possible to reason about each layer independently — what it owns, what it subscribes to, and what it must clean up when the state changes. Memory leaks in this codebase were found and fixed precisely because the separation made them visible.

---

### AndroidManifest.xml — Permissions Overview

| Permission | Purpose | Required for |
|---|---|---|
| `android.permission.INTERNET` | Allows the app to access the internet for streaming radio. | All streaming functionality |
| `android.permission.ACCESS_NETWORK_STATE` | Allows the app to check network connectivity (Wi-Fi, LTE, offline). | Reconnect loop, cellular fallback |
| `android.permission.WAKE_LOCK` | Keeps the CPU awake during background playback. | Prevents stream from stopping when device sleeps |
| `android.permission.FOREGROUND_SERVICE` | Allows running foreground services (required for Android 8+). | Background playback, notifications |
| `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Allows foreground service for media playback (Android 14+). | Compliance with Android 14+ media rules |
| `android.permission.POST_NOTIFICATIONS` | Allows posting notifications (Android 13+). | Playback notifications, media controls |

**Note:**
- Permissions are requested in the manifest and some (like POST_NOTIFICATIONS) require runtime consent on Android 13+.
- Without these permissions, the app cannot stream, play in the background, or show notifications.

---

---

## 📦 Key Dependencies

### Core (all platforms)

| Package | Version | Purpose |
|---|---|---|
| `Microsoft.Maui.Controls` | 10.0.50 | .NET MAUI UI framework |
| `Microsoft.Maui.Essentials` | 10.0.50 | Platform APIs (Connectivity, Preferences, etc.) |
| `Microsoft.Maui.Graphics` | 10.0.50 | Drawing and graphics primitives |
| `Microsoft.Maui.Resizetizer` | 10.0.50 | SVG → platform icon/splash generation |
| `Microsoft.Extensions.Logging.Debug` | 10.0.5 | Debug logging |
| `CommunityToolkit.Maui` | 14.0.1 | MAUI community extensions |
| `LibVLCSharp` | 3.9.6 | C# bindings for LibVLC audio engine |

### Android-only

| Package | Version | Purpose |
|---|---|---|
| `VideoLAN.LibVLC.Android` | 3.7.0-beta | Native LibVLC library (`.so` binaries for ARM/x86). **Beta is intentional** — this is the only version that compiles correctly against the memory layout of modern Android devices (ARMv8/64-bit). The stable 3.x release produces linker errors on current hardware. Google Play accepts and distributes this build without issues. |
| `LibVLCSharp` | 3.9.6 | C# bindings for LibVLC — the only VLC wrapper used in this project |
| `LibVLCSharp.Android.AWindowModern` | 3.9.6 | Android surface/window integration for LibVLC |
| `Xamarin.AndroidX.Media` | 1.7.1.2 | `MediaBrowserServiceCompat` — required for Android Auto |
| `Xamarin.AndroidX.Lifecycle.*` | 2.10.0.2 | Must be explicitly pinned — see below |
| `Xamarin.AndroidX.SavedState.SavedState.Ktx` | 1.4.0.2 | SavedState Kotlin extensions (AndroidX dependency) |

> ⚠️ **AndroidX.Lifecycle version pinning — required for build**
>
> `Xamarin.AndroidX.Media` has deep transitive dependencies on AndroidX Lifecycle. Without explicit version pins, NuGet pulls in conflicting versions and the build fails with errors like `Duplicate class kotlin.collections.jdk8.*` or `Cannot resolve symbol 'LifecycleOwner'`.
>
> Add these to your `.csproj`:

```xml
<PackageReference Include="Xamarin.AndroidX.Lifecycle.Common" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.Common.Jvm" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.LiveData" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.LiveData.Core" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.LiveData.Core.Ktx" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.LiveData.Ktx" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.Process" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.Runtime" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.Runtime.Ktx" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.ViewModel" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.ViewModel.Ktx" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.Lifecycle.ViewModelSavedState" Version="2.10.0.2" />
<PackageReference Include="Xamarin.AndroidX.SavedState" Version="1.4.0.2" />
<PackageReference Include="Xamarin.AndroidX.SavedState.SavedState.Ktx" Version="1.4.0.2" />
```


---

---

## 🛠 Development Environment

The app was built entirely in **Visual Studio 2026** using the latest Microsoft frameworks available at the time of development. This setup is sufficient for building, running, and testing this kind of app.

**Building and basic testing:**
Visual Studio 2026 with the .NET MAUI workload covers everything needed — building, deploying to physical devices, and running on the built-in Android emulator for phones and tablets.

**Extended platform testing:**
Some targets are not available in Visual Studio's built-in emulator and require **Android Studio**:

- **Android Auto** — tested using the Android Auto Desktop Head Unit (DHU) emulator, available only through Android Studio's SDK tools
- **Android Desktop / ChromeOS** — tested using the large-screen Android emulator in Android Studio
- **Android Automotive OS** — tested using the AAOS emulator (AVD Manager in Android Studio), which simulates a car with a built-in Android system and no phone

Physical devices tested: Android phones, Android TV boxes (used as dedicated in-car players), Bluetooth speakers and car head units.

Between Visual Studio 2026 for development and Android Studio for extended emulator targets, the full platform matrix is covered. No other tooling is required.

---

---

## 📱 Requirements

- **Android 8–16 (API 26–36)** — supported range
- .NET 10
- Internet connection (Wi-Fi, 4G, 5G)

---

## 👤 Author

**Tomek Maslowski / tmfgroup**
2025–2026

Support the author: [buycoffee.to/toevi](https://buycoffee.to/toevi)
🌐 [toevi.github.io/RadioAndroidPro](https://toevi.github.io/RadioAndroidPro/)

---

## 📄 License

The app is free for personal use.

LibVLC is used under the [LGPL license](https://www.videolan.org/legal.html).

Users are responsible for ensuring they have proper access rights to all streams they add.

---

Thank you all. Special thanks to lead tester Ian Davidson
