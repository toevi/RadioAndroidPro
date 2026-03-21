# 📻 RadioAndroid PRO

🌐 **[Project Website & Google Play → toevi.github.io/RadioAndroidPro](https://toevi.github.io/RadioAndroidPro/)**

**Internet radio player for Android — app written in C# and .NET MAUI, powered by the native LibVLC engine via C# bindings.**

No Kotlin. No Gradle plugins. Pure C# from UI to audio engine integration — the playback engine is LibVLC, a battle-tested open-source media engine, not something written from scratch.

> **PRO** stands for **P**atched, **R**efined & **O**ptimized —
> not a marketing badge, but an honest description of the development process:
> bugs patched, code refined through six months of testing, VLC engine optimized for live network streams.

> *The UI — five pages — is intentionally a remote control, nothing more. The real work happens in the background services: audio engine management, stream recovery, Android Auto integration, Bluetooth session handling, and state synchronization across the app. Getting all of this to work reliably in C# and .NET MAUI — a non-native layer on top of Android — was significantly harder than the equivalent in Kotlin, where the platform APIs are first-class citizens. MAUI abstracts the platform, which is convenient until you need to go deep into Android internals. Then you're fighting the framework as much as the problem. The result: a single C# codebase that runs on phones, tablets, Android TV, TV boxes, Android Desktop, Android Auto, Android Automotive OS, Bluetooth devices, and ChromeOS — tested and working on all of them.*

> *Why C# and .NET MAUI? Because MAUI is a cross-platform UI framework — the same codebase can target Android, Windows, and macOS without rewriting the application layer. Kotlin and Gradle are Android-only; there is no migration path from there. With C# and MAUI, a Windows desktop port is a realistic next step, and a macOS port follows the same logic. A Windows version is planned — likely the last milestone before the project is considered feature-complete.*

> *This app navigates uncharted waters. There are very few examples of .NET MAUI + C# + LibVLC on Android pushed this far — into native audio focus, background services, Android Auto, and deep platform integration. Some things did not work on the first attempt, or the second. The solutions in this README are the result of that process — not a straight line from idea to working code, but a map drawn while sailing.*

---

## Table of Contents

This article documents not only the general app description, but also specific technical problems and their solutions encountered during development. If you are a developer, be sure to check the sections below:

- Two-layer stream protection (VLC engine + app logic)
- VLC parameters: buffering, reconnect, engine and per-stream options
- Reconnect logic: reconnect loop, watchdog, cellular fallback
- Station list over 10: pagination and Android Auto handling
- Stream Stability: The Hard Problem
- Technical Deep Dives (VLC deadlocks, native memory, Android foreground service, Android Auto integration)
- AudioFocus and UI/Service State Synchronization
- VLC Equalizer in .NET MAUI (LibVLCSharp)
- AAOS Album Art: Bitmap vs URI (porting from AA/BT to Automotive)
- LibVLCSharp Memory Safety Checklist (SIGSEGV prevention, cleanup rules)
- System Architecture & Protection Layers
- AndroidManifest.xml — Permissions Overview
- Project Structure & Key Dependencies
- Development Environment
- License & Author

---

### This is not Spotify, YouTube or RadioTunes

Services like Spotify, YouTube, or RadioTunes are stable because they own and control the entire stack — the server infrastructure, the streaming protocol, the content delivery network, and the client app. Every component is designed to work with every other component. If something breaks, they fix both ends. Reliability is engineered into a closed system.

RadioAndroid is only the client. It has no control over the server side. It must handle hundreds of different radio servers, streaming protocols (HTTP, HLS, AAC, MP3, Ogg, DASH, ICY, and more), server configurations, and network conditions — none of which were designed with this client in mind. Every station is a different unknown. The server can drop the connection without warning, send malformed headers, change bitrate mid-stream, or simply go offline. The client has to survive all of it gracefully.

That is the real technical challenge — and the reason stream stability required the depth of work documented in this README. Every reconnect loop, every watchdog timer, every threading workaround, every native memory guard exists because there is no cooperative server on the other end. Just an unknown stream, an unknown protocol, and a client that has to stay alive regardless.

### Supported platforms

| Platform | Notes |
|---|---|
| 📱 Android phones & tablets | Android 8–16 (API 26–35) |
| 📺 Android TV / TV boxes | Full support — tested on TV boxes used as dedicated in-car players |
| 🖥 Android Desktop | Supported — large-screen layout scales correctly |
| 🚗 Android Auto | Tested and passed Google Play AA review |
| 🚙 Android Automotive OS | Cars with built-in Android system (no phone required) |
| 🎵 Bluetooth devices | Headphones, speakers, car head units, steering wheel controls, HiFi receivers — any BT device that uses Android media session. Wear OS watches not supported. |

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

> **Known limitation:** In certain edge cases — network handoff between Wi-Fi and mobile data, Bluetooth or Android Auto disconnection mid-stream — the reconnect loop may continue without a stop flag being set. In these cases, pressing Stop manually terminates playback. These cases are identified and will be addressed in a future update.

> *This is a project, not a finished product. Bugs are fixed continuously as they surface — driven by a growing number of users, devices, and platforms. Every new device, every new Android version, every new head unit is a potential new edge case. That is the nature of a universal client running on hardware it has never seen before.*

---

## 🔧 Technical Deep Dives

If you think combining C#, .NET MAUI, LibVLC, Android Foreground Service, and Android Auto into a radio app sounds like a hello world project — this section is the answer to that. It started that way. It turned out to be a collision with hardcore world.

This section documents the six hardest problems encountered building RadioAndroid PRO with LibVLCSharp + .NET MAUI on Android. Each one has no complete example in any official documentation. Each one was found through crashes, native debugger sessions, and reading LibVLC C source code.

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

### 4. MediaBrowserServiceCompat and Android Auto

**The symptom**

The app passes AA certification on paper but behaves unexpectedly on head units: station list is cut off at 10 items, navigation wraps around unexpectedly, metadata updates lag, or the media session stops responding to hardware controls after a period of inactivity.

**The root cause (multiple issues)**

Android Auto requires a working `MediaBrowserServiceCompat` implementation. The Xamarin/MAUI C# bindings for `androidx.media` are incomplete and poorly documented. Problems compound: several behaviors that work correctly in the Java/Kotlin world simply do not have complete C# examples anywhere.

#### Issue A: Station list and pagination awareness

AA head units may call `OnLoadChildren()` multiple times with pagination parameters. If you have more than ~10 stations, some head units will only display the first page. The current implementation returns all stations in a single `SendResult()` call, which works on tested head units but may require pagination support for very large station lists.

> **Note:** Pagination behavior is head-unit-dependent. Some head units load all items in one call regardless. If your station list is large, consider implementing pagination via `Bundle` extras in `OnLoadChildren()`. Always test on a real device or the official Android Auto Desktop Head Unit (DHU) emulator.

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

### 5. VLC Equalizer in .NET MAUI (LibVLCSharp)

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

### 6. AudioFocus and UI/Service State Synchronization

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

### 7. AAOS Album Art — Bitmap Works on BT and AA, Ignored on Automotive

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

## 🏗 Architecture

### System Layers

```
┌──────────────────────────────────────────────────────────────┐
│                        UI Layer                             │
│  - RadioPage.xaml, StationPage.xaml, EditStationPage.xaml    │
│  - User interaction: Play, Stop, Next, Prev, station select  │
└───────────────▲──────────────────────────────────────────────┘
                │
                │  (user commands)
                ▼
┌──────────────────────────────────────────────────────────────┐
│                App Logic / MVVM Layer                       │
│  - RadioStateService.cs, StationService.cs, SettingsService │
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
│   │   ├── StationPage.xaml        — Station list (list + tile view)
│   │   ├── StationPage.xaml.cs     — Station list logic
│   │   ├── EditStationPage.xaml    — Add/edit stations, playlist, EQ
│   │   ├── EditStationPage.xaml.cs — Add/edit logic
│   │   ├── HelpPage.xaml           — User guide
│   │   └── HelpPage.xaml.cs        — User guide logic
│   ├── Services/
│   │   ├── RadioStateService.cs    — Shared playback state (MVVM)
│   │   ├── StationService.cs       — Station selection logic
│   │   └── SettingsService.cs      — Persisted user settings
│   └── Models/
│       ├── Station.cs              — Station model (name + URL)
│       └── StacjaViewModel.cs      — ViewModel for station (MVVM)
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

## 📱 Requirements

- **Android 8–16 (API 26–35)** — supported range
- .NET 10
- Internet connection (Wi-Fi, 4G, 5G)

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
| `Vlc.DotNet.Core` | 3.1.0 | VLC .NET core interop layer — used alongside `LibVLCSharp`, not interchangeable |
| `Vlc.DotNet.Core.Interops` | 3.1.0 | VLC native interop helpers — part of the same required pair |

### Android-only

| Package | Version | Purpose |
|---|---|---|
| `VideoLAN.LibVLC.Android` | 3.7.0-beta | Native LibVLC library (`.so` binaries for ARM/x86). **Beta is intentional** — this is the only version that compiles correctly against the memory layout of modern Android devices (ARMv8/64-bit). The stable 3.x release produces linker errors on current hardware. Google Play accepts and distributes this build without issues. |
| `LibVLCSharp` | 3.9.6 | C# bindings for LibVLC. Required alongside `Vlc.DotNet.Core` — both serve different roles and are not interchangeable. |
| `Vlc.DotNet.Core` | 3.1.0 | VLC .NET core interop layer. Works together with `LibVLCSharp`, not as a replacement — removing either breaks the integration. |
| `Vlc.DotNet.Core.Interops` | 3.1.0 | VLC native interop helpers. Part of the same required pair. |
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

### Windows-only

| Package | Version | Purpose |
|---|---|---|
| `Microsoft.Maui.Graphics.Win2D.WinUI.Desktop` | 10.0.50 | Win2D rendering backend for Windows |

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

*PS. A small project that started as a free, ad-free personal car radio — for my own use — grew into an app on Google Play for everyone. A few people from YouTube and my family inspired me and helped me through the hardest moment: getting through Google Play's review and testing process. Thank you all.*
