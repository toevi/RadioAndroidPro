# 📻 RadioAndroid PRO

🌐 **[Strona projektu i Google Play → toevi.github.io/RadioAndroidPro](https://toevi.github.io/RadioAndroidPro/)**

**Odtwarzacz internetowego radia dla Androida — aplikacja napisana w C# i .NET MAUI, napędzana natywnym silnikiem LibVLC poprzez bindingi C#.**

Zero Kotlina. Zero pluginów Gradle. Czysty C# od interfejsu użytkownika po integrację z silnikiem audio — silnikiem odtwarzania jest LibVLC, sprawdzony w boju open-source'owy silnik multimedialny, a nie coś pisanego od zera.

> **PRO** oznacza **P**atched, **R**efined & **O**ptimized (Załatane, Dopracowane i Zoptymalizowane) —
> nie jest to etykietka marketingowa, lecz uczciwy opis procesu tworzenia:
> błędy załatane, kod dopracowany przez sześć miesięcy testów, silnik VLC zoptymalizowany pod kątem strumieniowania na żywo przez sieć.

> *Interfejs — pięć stron — jest celowo zaprojektowany jako pilot, nic więcej. Cała prawdziwa praca dzieje się w serwisach działających w tle: zarządzanie silnikiem audio, odbudowa strumienia, integracja Android Auto, obsługa sesji Bluetooth i synchronizacja stanu w całej aplikacji. Sprawienie, żeby to wszystko działało niezawodnie w C# i .NET MAUI — niennatywnej warstwie na szczycie Androida — było znacznie trudniejsze niż odpowiednik w Kotlinie, gdzie API platformy są obywatelami pierwszej klasy. MAUI abstrahuje platformę, co jest wygodne dopóki nie trzeba zejść głęboko w wnętrze Androida. Wtedy walczy się z frameworkiem tak samo jak z samym problemem. Efekt: jedna baza kodu w C#, która działa na telefonach, tabletach, Android TV, TV boxach, Android Desktop, Android Auto, Android Automotive OS, urządzeniach Bluetooth i ChromeOS — przetestowana i działająca na wszystkich.*

> *Dlaczego C# i .NET MAUI? Bo MAUI to wieloplatformowy framework UI — ta sama baza kodu może celować w Androida, Windows i macOS bez przepisywania warstwy aplikacji. Kotlin i Gradle są tylko na Androida; nie ma stamtąd żadnej ścieżki migracji. Z C# i MAUI port na Windows desktop to realistyczny kolejny krok, a port na macOS wynika z tej samej logiki. Wersja Windows jest planowana — prawdopodobnie ostatni milestone przed uznaniem projektu za feature-complete.*

> *Ta aplikacja płynie po nieznanych wodach. Bardzo mało jest przykładów .NET MAUI + C# + LibVLC na Androidzie posuniętych tak daleko — w natywny AudioFocus, serwisy działające w tle, Android Auto i głęboką integrację z platformą. Nie wszystko działało od pierwszego razu, ani od drugiego. Rozwiązania opisane w tym dokumencie to efekt tego procesu — nie prosta linia od pomysłu do działającego kodu, lecz mapa rysowana w trakcie żeglowania.*

---

## Spis treści

Ten dokument opisuje nie tylko samą aplikację, ale też konkretne problemy techniczne i ich rozwiązania napotkane podczas tworzenia. Jeśli jesteś deweloperem, koniecznie sprawdź poniższe sekcje:

- Dwuwarstwowa ochrona strumienia (silnik VLC + logika aplikacji)
- Parametry VLC: buforowanie, reconnect, opcje silnika i per-stream
- Logika reconnect: pętla reconnect, watchdog, cellular fallback
- Lista stacji powyżej 10: paginacja i obsługa Android Auto
- Stabilność strumienia: Trudny problem
- Technical Deep Dives (deadlocki VLC, pamięć natywna, foreground service Android, integracja Android Auto)
- AudioFocus i synchronizacja stanu UI/Serwis
- Korektor VLC w .NET MAUI (LibVLCSharp)
- Checklista bezpieczeństwa pamięci LibVLCSharp (zapobieganie SIGSEGV, zasady czyszczenia)
- Architektura systemu i warstwy ochrony
- AndroidManifest.xml — przegląd uprawnień
- Struktura projektu i kluczowe zależności
- Środowisko deweloperskie
- Licencja i autor

---

### To nie jest Spotify, YouTube ani RadioTunes

Serwisy takie jak Spotify, YouTube czy RadioTunes działają stabilnie, bo kontrolują cały stos — infrastrukturę serwerową, protokół strumieniowania, sieć dostarczania treści i aplikację kliencką. Każdy komponent jest zaprojektowany do współpracy z każdym innym. Jeśli coś się psuje, naprawiają obie strony jednocześnie. Niezawodność jest wbudowana w zamknięty system.

RadioAndroid to tylko klient. Nie ma żadnej kontroli nad stroną serwerową. Musi obsługiwać setki różnych serwerów radiowych, protokołów strumieniowania (HTTP, HLS, AAC, MP3, Ogg, DASH, ICY i inne), konfiguracji serwerów i warunków sieciowych — żaden z nich nie był projektowany z myślą o tym kliencie. Każda stacja to inny nieznany. Serwer może zerwać połączenie bez ostrzeżenia, wysłać zniekształcone nagłówki, zmienić bitrate w połowie strumienia albo po prostu wyłączyć się. Klient musi to wszystko przeżyć bez utraty odtwarzania.

To jest właśnie prawdziwe wyzwanie techniczne — i powód, dla którego stabilność strumienia wymagała tak głębokiej pracy opisanej w tym dokumencie. Każda pętla reconnect, każdy watchdog timer, każdy workaround wątkowy, każde zabezpieczenie pamięci natywnej istnieje dlatego, że po drugiej stronie nie ma żadnego współpracującego serwera. Tylko nieznany strumień, nieznany protokół i klient, który musi działać bez względu na wszystko.

### Obsługiwane platformy

| Platforma | Uwagi |
|---|---|
| 📱 Telefony i tablety Android | Android 8–16 (API 26–35) |
| 📺 Android TV / TV boxy | Pełne wsparcie — testowane na TV boxach używanych jako dedykowane odtwarzacze samochodowe |
| 🖥 Android Desktop | Obsługiwany — układ na duże ekrany skaluje się poprawnie |
| 🚗 Android Auto | Przetestowany i zatwierdzony w Google Play pod kątem AA |
| 🚙 Android Automotive OS | Samochody z wbudowanym systemem Android (bez telefonu) |
| 🎵 Urządzenia Bluetooth | Słuchawki, głośniki, samochodowe head unity, przyciski na kierownicy, odbiorniki HiFi — każde urządzenie BT korzystające z Android media session. Zegarki Wear OS nie są obsługiwane. |

---

## 🛡 Stabilność strumienia — Trudny problem

**Tu właśnie RadioAndroid różni się od większości hobbystycznych aplikacji radiowych.**

Aplikacja jest zaprojektowana do pracy w samochodzie. W samochodzie utrata połączenia sieciowego to nie edge case — to codzienność. Tunele, martwe strefy, przełączanie między wieżami komórkowymi, przejście z Wi-Fi na LTE po wyjeździe z domu, krótkie burty danych wyzwalane przez GPS, które zagładzają bufor audio. Aplikacja radiowa, która tego nie przeżyje, jest bezużyteczna jako aplikacja samochodowa. Płynna obsługa rozłączeń to nie bonus — to absolutne minimum.

Strumieniowanie internetowego radia na Androidzie jest złudnie proste — dopóki nie zacznie sprawiać problemów. Większość aplikacji działa przez kilka minut, po czym cicho pada, gdy sieć się potknie, serwer zrywa połączenie albo telefon przełącza się z Wi-Fi na dane mobilne. Strumień po prostu… milknie. Bez błędu, bez wznowienia, bez dźwięku.

### Dlaczego tak się dzieje

LibVLC to potężny silnik audio, ale out-of-the-box traktuje każdy URL jak plik lokalny. Brak buforowania sieciowego, brak auto-reconnect, brak tolerancji na dryft zegara w strumieniach na żywo. Pierwsze mikro-zakłócenie sieci = utracony strumień.

Do tego VLC wywołuje zdarzenia (Stopped, EndReached, Error) na **natywnych wątkach**. Wywołanie metod VLC (Stop, Play) z wnętrza tych callbacków powoduje **deadlocki na natywnych mutexach** — silnik audio zamarza na stałe i jedynym sposobem na odzyskanie kontroli jest zabicie procesu.

To nie są teoretyczne problemy. To właśnie dlatego większość aplikacji radiowych opartych na LibVLCSharp + MAUI na GitHubie ma otwarte issues o treści "strumień zatrzymuje się po kilku minutach" albo "aplikacja losowo się zawiesza".

### Jak RadioAndroid to rozwiązuje

**Dwuwarstwowa ochrona:**

**Warstwa 1 — Konfiguracja silnika VLC**

Silnik VLC jest konfigurowany specjalnie pod kątem strumieniowania na żywo przez sieć, nie dla plików lokalnych.

**Opcje silnika** (ustawiane raz przy inicjalizacji LibVLC — współdzielone przez wszystkie strumienie):

| Opcja | Co robi |
|---|---|
| `--network-caching=5000` | 5-sekundowy bufor sieciowy — pochłania jitter Wi-Fi i krótkie przerwy |
| `--live-caching=5000` | 5-sekundowy bufor strumienia na żywo — zapobiega underrun na źródłach live |
| `--http-reconnect` | VLC automatycznie ponawia połączenia HTTP po zerwaniu (pierwsza linia obrony) |
| `--sout-mux-caching=2000` | 2-sekundowy bufor na poziomie mux dla strumieni multipleksowanych |
| `--clock-jitter=0` | Ignoruje dryft zegara — radio na żywo nie ma stabilnego zegara referencyjnego |
| `--clock-synchro=0` | Wyłącza synchronizację A/V — live = real-time, synchronizacja niepotrzebna |

**Opcje per-stream** (ustawiane dla każdego obiektu `Media` przed `Play()`):

| Opcja | Co robi |
|---|---|
| `:network-caching=5000` | Bufor sieciowy per-stream (wzmacnia ustawienie silnika) |
| `:live-caching=5000` | Bufor live per-stream |
| `:http-reconnect` | HTTP reconnect per-stream |
| `:adaptive-logic=highest` | HLS/DASH: wybiera najwyższą dostępną jakość |

> **Dlaczego oba poziomy?** Opcje silnika to wartości domyślne. Opcje per-stream zapewniają, że każdy nowy obiekt `Media` dziedziczy prawidłowe ustawienia, nawet jeśli VLC wewnętrznie resetuje domyślne. Szelki i pasek.

**Warstwa 2 — Odbudowa na poziomie aplikacji (gdy VLC sam nie da rady)**

- **Pętla reconnect** — do 5 prób z wykładniczym backoffem (1s → 2s → 4s → 8s → 15s)
- **Watchdog timer** — wykrywa ciche zawieszenia VLC (brak aktywności audio przez 15 sekund) i uruchamia odbudowę
- **Cellular fallback** — jeśli Wi-Fi traci internet (często: router traci DNS/uplink), aplikacja wiąże proces z danymi mobilnymi i przełącza z powrotem automatycznie po odzyskaniu Wi-Fi
- **Hard reset** — po 3 nieudanych cyklach odbudowy silnik VLC jest w pełni niszczony i tworzony od nowa
- **Bezpieczne wątkowanie** — callbacki VLC wyzwalające logikę reconnect (`EndReached`, `EncounteredError`) są wysyłane do thread poola przez `ThreadPool.QueueUserWorkItem`, nigdy nie wywołując metod VLC na natywnych wątkach. Callbacki tylko stanowe (`Playing`, `Paused`, `Stopped`) działają bezpośrednio, ale nigdy nie wywołują z powrotem VLC.
- **Bezpieczeństwo pamięci natywnej** — pollowanie metadanych i referencje do media są czyszczone *przed* zwolnieniem pamięci natywnej, zapobiegając crashom use-after-free

Jeśli wszystko zawiedzie, odtwarzanie zatrzymuje się czysto z komunikatem statusu. Naciśnij Play, żeby spróbować ponownie.

### Stop użytkownika = Stop

Gdy naciśniesz Stop lub Pauza, aplikacja **pozostaje zatrzymana**. Zmiany sieci (przełączanie Wi-Fi, wjazd do domu) nie wywołają niechcianego auto-play. System reconnect jest aktywny tylko wtedy, gdy aplikacja faktycznie próbuje odtwarzać.

> **Znane ograniczenie:** W pewnych przypadkach brzegowych — przejście sieci między Wi-Fi a danymi mobilnymi, rozłączenie Bluetooth lub Android Auto w trakcie odtwarzania — pętla reconnect może kontynuować działanie bez ustawienia flagi zatrzymania. W tych przypadkach ręczne naciśnięcie Stop kończy odtwarzanie. Te przypadki są zidentyfikowane i będą naprawione w przyszłej aktualizacji.

> *To jest projekt, nie gotowiec. Błędy są naprawiane na bieżąco w miarę jak się pojawiają — napędzane rosnącą liczbą użytkowników, urządzeń i platform. Każde nowe urządzenie, każda nowa wersja Androida, każdy nowy head unit to potencjalny nowy przypadek brzegowy. Taka jest natura uniwersalnego klienta działającego na sprzęcie, którego wcześniej nie widział.*

---

## 🔧 Technical Deep Dives

Jeśli myślisz że połączenie C#, .NET MAUI, LibVLC, Android Foreground Service i Android Auto w aplikację radiową brzmi jak projekt hello world — ta sekcja jest odpowiedzią na to. Na początku tak to wyglądało. Okazało się, że zderzyłem się z hardcore world.

Ta sekcja dokumentuje sześć najtrudniejszych problemów napotkanych podczas budowania RadioAndroid PRO z LibVLCSharp + .NET MAUI na Androidzie. Żaden z nich nie ma kompletnego przykładu w żadnej oficjalnej dokumentacji. Każdy został odkryty przez crashe, sesje z natywnym debuggerem i czytanie kodu źródłowego LibVLC w C.

Jeśli budujesz aplikację radiową lub audio na tym stosie i uderzasz w ściany — to jest dla Ciebie.

---

### 1. Deadlock na natywnym wątku LibVLC

**Objaw**

Aplikacja całkowicie zamarza. Żadnego crashu, żadnego wyjątku, żadnych logów. Silnik audio wisi na stałe i jedyną opcją odbudowy jest zabicie procesu. Dzieje się to pozornie losowo — często po zdarzeniu sieciowym, błędzie strumienia lub zmianie stacji.

**Przyczyna źródłowa**

VLC wywołuje zdarzenia odtwarzania (`EndReached`, `Stopped`, `EncounteredError`, `Playing`) na **natywnych wątkach C** — nie na zarządzanym thread poolu .NET, nie na głównym wątku Androida. To surowe pthready wewnątrz silnika VLC.

Natywny silnik VLC trzyma wewnętrzne mutexy podczas wysyłania tych zdarzeń. Jeśli wywołasz **jakąkolwiek** metodę VLC (w tym `Stop()`, `Play()`, `Media = null`) z wnętrza handlera zdarzenia, VLC próbuje zająć te same mutexy, które są już zajęte przez dispatch zdarzeń. Klasyczny deadlock. Wątek audio czeka w nieskończoność. Silnik jest zamrożony.

Jest to wspomniane jednym zdaniem w dokumentacji LibVLCSharp. Nie ma żadnych przykładów pokazujących poprawny wzorzec dla aplikacji produkcyjnej.

**Zły wzorzec**

```csharp
_mediaPlayer.EndReached += (sender, e) =>
{
    // ❌ DEADLOCK — to działa na natywnym wątku VLC
    // VLC trzyma wewnętrzne mutexy podczas wywołania tego zdarzenia
    _mediaPlayer.Stop();       // próbuje zająć te same mutexy → freeze
    _mediaPlayer.Media = null; // ten sam problem
    StartReconnect();          // jeśli to wywołuje Play() → freeze
};
```

Ten wzorzec pojawia się w większości przykładów LibVLCSharp na GitHubie i Stack Overflow. Działa poprawnie w demach, gdzie ręcznie klikasz przyciski. Niezawodnie deadlockuje w produkcji pod obciążeniem.

**Poprawny wzorzec**

Natychmiast wyjdź z natywnego wątku. Nie wywołuj żadnej metody VLC przed opuszczeniem callbacku.

```csharp
_mediaPlayer.EndReached += (sender, e) =>
{
    // ✅ Natychmiast wychodź z natywnego wątku — brak wywołań VLC tutaj
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
    // ✅ Teraz na thread poolu — bezpieczne wywoływanie metod VLC
    _mediaPlayer.Stop();
    _mediaPlayer.Media = null;
    StartReconnect();
}
``` `Task.Run()` to minimalne skuteczne rozwiązanie — ilustruje zasadę: wyjdź z natywnego wątku zanim wywołasz cokolwiek związanego z VLC. Produkcyjna implementacja używa `ThreadPool.QueueUserWorkItem()` dla callbacków wyzwalających logikę reconnect (`EndReached`, `EncounteredError`) — jest lżejszy niż `Task.Run()`, bo nie tworzy pełnego obiektu `Task` z machinery anulowania, co jest zbędne dla fire-and-forget callbacków VLC. Zasada jest identyczna; wybór to optymalizacja.

**Dodatkowe zasady**

- Nigdy nie wywołuj `_mediaPlayer.Stop()`, `_mediaPlayer.Play()` ani `_mediaPlayer.Media = X` z wnętrza żadnego handlera zdarzenia VLC, nawet pośrednio przez wywołania metod.
- Jeśli używasz `Dispatcher.Dispatch()` lub `MainThread.BeginInvokeOnMainThread()`, upewnij się, że nie wywołujesz metod VLC na wątku UI.
- Bezpieczny wzorzec to zawsze: natywne zdarzenie VLC → `Task.Run()` → Twoja logika.

---

### 2. SIGSEGV z pamięci natywnej LibVLCSharp

**Objaw**

Aplikacja crashuje z `SIGSEGV` (sygnał 11) — natywny błąd segmentacji. W logu crashu pojawia się jako crash wewnątrz natywnego kodu LibVLC, nie w Twoim kodzie C#. Stack trace wskazuje na wnętrze VLC. Jest nieregularny i trudny do konsekwentnego odtworzenia. Często zdarza się podczas zmiany stacji, szybkich sekwencji play/stop lub gdy aplikacja przechodzi w tło.

**Przyczyna źródłowa**

LibVLCSharp opakowuje natywne obiekty C (`libvlc_media_t`, `libvlc_media_player_t`) za uchwytami C#. Kluczowy punkt: **gdy ustawiasz `MediaPlayer.Media = null`, natywna pamięć poprzedniego obiektu `Media` jest zwalniana natychmiast**.

Ale "zwolnione" na poziomie natywnym nie oznacza "zwolnione" na poziomie C#. Każdy kod C# nadal trzymający referencję do starego `Media` — handlery zdarzeń, pętle pollowania w tle, czytniki metadanych — teraz trzyma wskaźnik do zwolnionej pamięci natywnej. Następny dostęp to crash use-after-free na poziomie C, który objawia się jako SIGSEGV.

To jest problem granicy natywne/zarządzane. GC zarządza obiektami C#, ale nie ma wglądu w pamięć natywną.

**Scenariusz crashu**

```csharp
// Pollowanie metadanych w tle — działa co 2 sekundy
private async Task PollMetadataAsync()
{
    while (true)
    {
        await Task.Delay(2000);
        // ❌ Jeśli Media zostało ustawione na null między delay a tą linią,
        // pamięć natywna jest już zwolniona → SIGSEGV
        var title = _mediaPlayer.Media?.Meta(MetadataType.Title);
    }
}

// Tymczasem, przy zmianie stacji:
private void SwitchStation(string url)
{
    _mediaPlayer.Stop();
    _mediaPlayer.Media = null; // ← pamięć natywna zwalniana tutaj
    _mediaPlayer.Media = new Media(_libVlc, new Uri(url));
    _mediaPlayer.Play();
}
```

Null-conditional `?.` nie chroni Cię tutaj. Właściwość `Media` w C# może zwrócić wrapper non-null, podczas gdy pamięć natywna jest już zwolniona. Crash dzieje się wewnątrz natywnego wywołania, które następuje po tym.

**Poprawny wzorzec**

Wyczyść wszystkie referencje i zatrzymaj wszystkie pollowanie *przed* zwolnieniem pamięci natywnej. Użyj flagi guard, żeby zapobiec ponownemu wejściu.

> **Uwaga o `Thread.Sleep(50)`:** 50-milisekundowe wstrzymanie w poniższym wzorcu jest celowe — nie jest to hack ani workaround. LibVLC ma znany wewnętrzny micro-freeze podczas natywnego teardownu mediów. Bez tej pauzy token anulowania jest ustawiony, ale pętla pollowania nie miała jeszcze szansy go zaobserwować i wyjść zanim zostanie zwolniona pamięć natywna. 50ms to minimalny niezawodny margines przetestowany w produkcji; usunięcie go przywraca crashe SIGSEGV.

```csharp
private CancellationTokenSource _metadataCts;
private volatile bool _mediaReleasing = false;

private async Task PollMetadataAsync(CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        await Task.Delay(2000, ct);

        // ✅ Sprawdź guard przed dotknięciem obiektów natywnych
        if (_mediaReleasing) break;

        try
        {
            var title = _mediaPlayer.Media?.Meta(MetadataType.Title);
            UpdateUI(title);
        }
        catch (Exception)
        {
            // Granica natywna — wyjątki tutaj mogą wskazywać na zwolnioną pamięć
            break;
        }
    }
}

private void SwitchStation(string url)
{
    // ✅ Krok 1: Zasygnalizuj wszystkim konsumentom żeby się zatrzymali
    _mediaReleasing = true;

    // ✅ Krok 2: Anuluj i poczekaj na zatrzymanie pollowania
    _metadataCts?.Cancel();
    _metadataCts?.Dispose();

    // ✅ Krok 3: Daj zadaniom w tle chwilę na wyjście
    // Thread.Sleep(50) jest tutaj celowy — nie jest to hacky workaround.
    // LibVLC ma znany wewnętrzny micro-freeze podczas teardownu mediów po stronie natywnej.
    // Bez tej pauzy token anulowania jest ustawiony, ale pętla pollowania nie miała
    // szansy go zaobserwować i wyjść zanim poniżej zostanie zwolniona pamięć natywna.
    // 50ms to minimalny niezawodny margines; usunięcie go przywraca crashe SIGSEGV.
    Thread.Sleep(50);

    // ✅ Krok 4: Teraz bezpieczne zwolnienie pamięci natywnej
    _mediaPlayer.Stop();
    var oldMedia = _mediaPlayer.Media;
    _mediaPlayer.Media = null;
    oldMedia?.Dispose();

    // ✅ Krok 5: Zresetuj guard i uruchom nowe media
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

**Kluczowe zasady**

- Zawsze anuluj i poczekaj na każdą pętlę w tle, która ma dostęp do `Media` lub `MediaPlayer`, przed ustawieniem `Media = null`.
- Jawnie wywołaj Dispose na starym obiekcie `Media`. Nie polegaj na GC — pamięć natywna nie jest zarządzana przez GC.
- Flaga guard `_isStartingPlayback` (sprawdzana wewnątrz `lock (_commandGate)`) zapobiega corrupcji stanu nowego odtwarzania przez callback `Stopped` podczas sekwencji Play→Stop→Play.
- Zasada kolejności czyszczenia — anuluj `_metaPollCts`, odepnij handler `MetaChanged`, wyzeruj `_currentMediaForMeta`, potem `Stop()`/`Media = null` — musi być przestrzegana w każdej ścieżce kodu resetującej player (`PlayRadio`, `StopRadio`, `HardResetVlc`, `OnDestroy`).
- Nigdy nie uzyskuj dostępu do `Media.Meta()` ani żadnej innej metody `Media` po tym, jak `MediaPlayer.Media` zostało ustawione na null lub zastąpione.

---

### 3. Crash Foreground Service na Androidzie 12 / 12.1 (API 31–32)

**Objaw**

Aplikacja crashuje specyficznie na urządzeniach z Androidem 12 i 12.1. Crash to `ForegroundServiceDidNotStartInTimeException` lub `RemoteServiceException`. Zdarza się przy zmianie stacji, nie tylko przy pierwszym uruchomieniu. Na Androidzie 13+ (API 33+) ten sam kod działa poprawnie. Na Androidzie 11 i poniżej też działa poprawnie.

**Przyczyna źródłowa**

Android 12 wprowadził rygorystyczną zasadę: po wywołaniu `startForegroundService()` serwis musi wywołać `startForeground()` **w ciągu 5 sekund**, lub system zabija go crashem w stylu ANR.

Ta zasada jest dobrze udokumentowana. Co nie jest udokumentowane: **dotyczy każdego intentu dostarczonego do serwisu**, nie tylko pierwszego uruchomienia. Gdy zmieniasz stację, zazwyczaj wysyłasz nowy intent do działającego serwisu z nowym URL. Serwis odbiera ten intent przez `OnStartCommand()`. Na Androidzie 12 5-sekundowy zegar restartuje się przy każdym takim intencie. Jeśli Twój `OnStartCommand()` wykonuje jakąkolwiek pracę asynchroniczną przed ponownym wywołaniem `startForeground()`, trafiasz w timeout.

Dodatkowo, `API 31–32` ma zepsutą interakcję z `StopForeground()`. Wywołanie `StopForeground(true)` na API 31–32 w pewnych sekwencjach może powodować `IllegalArgumentException`. Rozwiązanie (`StopForegroundCompat()`) wymaga shima kompatybilności.

**Sekwencja crashu na API 31–32**

```csharp
// ❌ To działa na API 33+, crashuje na API 31-32
[return: GeneratedEnum]
public override StartCommandResult OnStartCommand(Intent intent, StartCommandFlags flags, int startId)
{
    var url = intent.GetStringExtra("station_url");

    Task.Run(async () =>
    {
        await PrepareMediaAsync(url); // ← przerwa asynchroniczna tutaj
        StartForeground(NotificationId, BuildNotification()); // ← za późno na API 31-32
        _mediaPlayer.Play();
    });

    return StartCommandResult.Sticky;
}
```

**Poprawny wzorzec dla API 31–32**

Wywołaj `StartForeground()` **synchronicznie i natychmiast** na początku `OnStartCommand()`, przed jakąkolwiek pracą asynchroniczną. Aktualizuj zawartość powiadomienia później.

```csharp
[return: GeneratedEnum]
public override StartCommandResult OnStartCommand(Intent intent, StartCommandFlags flags, int startId)
{
    // ✅ Wywołaj StartForeground natychmiast — przed jakąkolwiek pracą asynchroniczną
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
                StopForegroundCompat(); // ← shim kompatybilności
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
            StopForeground(true); // przeciążenie bool nadal działa na 31-32
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

**Podsumowanie zasad dla Foreground Services w aplikacjach audio**

| Scenariusz | Zasada |
|---|---|
| Pierwsze `startForegroundService()` | Wywołaj `startForeground()` w ciągu 5 sekund |
| Zmiana stacji (nowy intent do działającego serwisu) | Wywołaj `startForeground()` ponownie na początku `OnStartCommand()` — 5-sekundowy zegar restartuje się |
| `StopForeground()` na API 31–32 | Użyj przeciążenia `bool` lub shima kompatybilności |
| API 33+ | `StopForeground(StopForegroundFlags.Remove)` działa poprawnie |

> **Wskazówka testowa:** Zawsze testuj specyficznie na API 31 lub 32. Emulatory są tutaj wystarczające. Emulatory API 33+ nie ujawnią tego błędu.

---

### 4. MediaBrowserServiceCompat i Android Auto

**Objaw**

Aplikacja przechodzi certyfikację AA na papierze, ale zachowuje się nieoczekiwanie na head unitach: lista stacji jest obcięta do 10 pozycji, nawigacja niespodziewanie się zapętla, aktualizacje metadanych są opóźnione, lub media session przestaje reagować na fizyczne przyciski po okresie bezczynności.

**Przyczyna źródłowa (wiele problemów)**

Android Auto wymaga działającej implementacji `MediaBrowserServiceCompat`. Bindingi C# Xamarin/MAUI dla `androidx.media` są niekompletne i słabo udokumentowane.

#### Problem A: Lista stacji i świadomość paginacji

Head unity AA mogą wywoływać `OnLoadChildren()` wielokrotnie z parametrami paginacji. Jeśli masz więcej niż ~10 stacji, niektóre head unity wyświetlą tylko pierwszą stronę. Aktualna implementacja zwraca wszystkie stacje w jednym wywołaniu `SendResult()`, co działa na testowanych head unitach, ale może wymagać obsługi paginacji dla bardzo dużych list stacji.

> **Uwaga:** Zachowanie paginacji zależy od head unitu. Jeśli lista stacji jest duża, rozważ implementację paginacji przez extras `Bundle` w `OnLoadChildren()`. Zawsze testuj na prawdziwym urządzeniu lub oficjalnym emulatorze DHU.

#### Problem B: Cykliczna nawigacja Next/Previous

W interfejsie Android Auto nie ma widocznego wskaźnika końca listy. Gdy logika Next/Previous zawija się z ostatniej stacji na pierwszą (lub odwrotnie), użytkownicy nie mają jak stwierdzić, że przeszli przez całą listę. To jest zamierzone zachowanie dla użytku samochodowego — udokumentuj to w kodzie, żeby przyszli maintainerzy nie "naprawili" zawijania.

```csharp
private int GetNextStationIndex(int currentIndex)
{
    // Zamierzone cykliczne zawijanie — w Android Auto nie ma wskaźnika końca listy
    // Ostatnia stacja → zawija do pierwszej; Pierwsza stacja ← zawija do ostatniej
    return (currentIndex + 1) % _stations.Count;
}
```

#### Problem C: Pinowanie wersji AndroidX.Lifecycle

`MediaBrowserServiceCompat` przez `Xamarin.AndroidX.Media` ma głębokie tranzytywne zależności od AndroidX Lifecycle. Domyślna rozdzielczość zależności NuGeta pobiera konfliktujące wersje podpakietów Lifecycle, powodując błędy buildu typu `Duplicate class kotlin.collections.jdk8.*` lub `Cannot resolve symbol 'LifecycleOwner'`.

Rozwiązaniem jest jawne przypięcie wszystkich pakietów Lifecycle w `.csproj`. Pełna lista wymaganych pakietów z poprawnymi wersjami znajduje się w sekcji **Kluczowe zależności** poniżej.

#### Problem D: Media session przestaje reagować

Jeśli token `MediaSession` nie jest poprawnie połączony z `MediaBrowserServiceCompat.SessionToken`, fizyczne przyciski multimediów (przyciski na kierownicy, Bluetooth HID) przestają działać po upłynięciu timeout sesji head unitu. Linia `SessionToken = _mediaSession.SessionToken` w `OnCreate()` jest obowiązkowa — bez niej kontrolki AA i Bluetooth działają początkowo, ale przestają po bezczynności.

```csharp
public override void OnCreate()
{
    base.OnCreate();

    _mediaSession = new MediaSessionCompat(this, "RadioAndroidPRO");
    _mediaSession.SetCallback(new MediaSessionCallback(this));
    _mediaSession.SetFlags(
        MediaSessionCompat.FlagHandlesMediaButtons |
        MediaSessionCompat.FlagHandlesTransportControls);

    // ✅ Ta linia jest obowiązkowa — łączy sesję z serwisem browsera
    // Bez niej kontrolki AA i Bluetooth działają początkowo, ale przestają po bezczynności
    SessionToken = _mediaSession.SessionToken;

    _mediaSession.IsActive = true;
}
```

---

### 5. Korektor VLC w .NET MAUI (LibVLCSharp)

**Obsługa korektora w LibVLCSharp jest funkcjonalna, ale nie w pełni udokumentowana.**

#### Jak to działa

LibVLC udostępnia API korektora przez klasy `AudioEqualizer` i `MediaPlayer`. Możesz stworzyć korektor, ustawić wzmocnienia pasm i przypisać go do playera.

#### Przykład: Konfiguracja korektora (9 pasm w UI, do 10 obsługiwanych przez VLC)

```csharp
using LibVLCSharp.Shared;

// Utwórz instancję korektora
var equalizer = new AudioEqualizer();

// Ustaw wzmocnienie dla każdego pasma (przykładowe wartości)
equalizer.SetAmp(0, 3.0f); // Pasmo 0: +3dB
equalizer.SetAmp(1, -2.0f); // Pasmo 1: -2dB
// ... powtórz dla innych pasm według potrzeb

// Opcjonalnie ustaw preamp
equalizer.Preamp = 0.0f;

// Przypisz korektor do MediaPlayer
mediaPlayer.SetEqualizer(equalizer);

// Aby wyłączyć korektor:
mediaPlayer.SetEqualizer(null);
```

#### Praktyczne uwagi

- Liczba pasm i częstotliwości: użyj `AudioEqualizer.BandCount` i `AudioEqualizer.GetBandFrequency(int band)` żeby sprawdzić dostępne pasma i ich częstotliwości.
- Możesz stworzyć własny interfejs (np. suwaki) w MAUI i powiązać ich wartości z `SetAmp(band, gain)`.
- Korektor można zmieniać w runtime; zmiany działają natychmiast.
- Zawsze sprawdzaj null i obsługuj wyjątki, szczególnie przy zmianie strumieni lub niszczeniu playera.

**Wskazówka:** Zintegruj kontrolki korektora w `EditStationPage.xaml` lub dedykowanej stronie ustawień.

#### Przykład: Wyświetlanie częstotliwości pasm

```csharp
for (int i = 0; i < AudioEqualizer.BandCount; i++)
{
    float freq = AudioEqualizer.GetBandFrequency(i);
    Console.WriteLine($"Pasmo {i}: {freq} Hz");
}
```

**Referencja:** [LibVLCSharp AudioEqualizer API](https://code.videolan.org/videolan/LibVLCSharp/-/blob/master/LibVLCSharp/AudioEqualizer.cs)

---

### 6. AudioFocus i synchronizacja stanu UI/Serwis

To jeden z najtrudniejszych problemów w tworzeniu aplikacji audio na Androidzie w ogóle — i znacznie trudniejszy w .NET MAUI niż w Kotlinie, gdzie platforma dostarcza narzędzia pierwszej klasy dokładnie do tego scenariusza.

**Problem**

Aplikacja radiowa nie żyje w izolacji. Android to system wielozadaniowy, a AudioFocus to zasób współdzielony. W każdej chwili inna aplikacja lub sam system może przerwać odtwarzanie: przychodzi SMS i wyzwala dźwięk powiadomienia, nawigacja Android Auto zaczyna mówić wskazówki, użytkownik otwiera YouTube albo inny odtwarzacz, przychodzi połączenie telefoniczne. Każde z tych zdarzeń wysyła sygnał AudioFocus do aplikacji. Aplikacja musi zareagować poprawnie — zapauzować lub ściszyć głośność — a potem wiedzieć kiedy i czy wznowić odtwarzanie.

Do tego UI i serwis działający w tle to osobne komponenty z osobnymi cyklami życia. Serwis działa ciągle w tle. UI może zostać zniszczone i odtworzone w każdej chwili. Za każdym razem gdy UI wraca, musi połączyć się z serwisem i przywrócić dokładny aktualny stan. Ghost state UI — pokazujący "odtwarza" gdy serwis jest zapauzowany, albo złą nazwę stacji — to realny błąd, który dezorientuje użytkowników.

W Kotlinie rozwiązują to LiveData, ViewModel i komponenty architektury Android lifecycle. W MAUI nic z tego nie istnieje. Wszystko trzeba zbudować ręcznie.

**Obsługa AudioFocus — co musi być pokryte**

- `AUDIOFOCUS_LOSS` — inna aplikacja przejęła focus na stałe. Aplikacja musi zatrzymać odtwarzanie i nie wznawiać automatycznie.
- `AUDIOFOCUS_LOSS_TRANSIENT` — focus utracony tymczasowo (połączenie, komunikat nawigacji). Aplikacja musi zapauzować i wznowić automatycznie gdy focus wróci.
- `AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK` — inna aplikacja potrzebuje audio chwilowo. Aplikacja może ściszyć głośność zamiast pauzować.
- `AUDIOFOCUS_GAIN` — focus wrócił. Aplikacja musi wznowić jeśli była zapauzowana z powodu tymczasowej utraty, ale nie może wznawiać jeśli użytkownik ręcznie zatrzymał odtwarzanie.

Kluczowe rozróżnienie: naciśnięcie Stop przez użytkownika musi zawsze wygrać, niezależnie od tego jakie sygnały AudioFocus nadejdą potem.

**Synchronizacja UI/Serwis — co musi być pokryte**

Gdy UI jest odtworzone lub użytkownik wraca do aplikacji, następujące rzeczy muszą zostać przywrócone poprawnie i natychmiast: aktualny stan odtwarzania, nazwa stacji i metadane, stan wizualny kontrolek, stan interfejsu Android Auto.

W MAUI rozwiązanie wymaga współdzielonego serwisu stanu (`RadioStateService`) który jest jedynym źródłem prawdy. Serwis w tle do niego zapisuje, UI z niego czyta. Wymaga to starannego zarządzania subskrypcjami zdarzeń — subskrybowanie gdy strona się pojawia, odsubskrybowanie gdy znika.

**Dlaczego to zajęło dużo czasu**

Interakcje między zdarzeniami AudioFocus, logiką reconnect, ręcznymi zatrzymaniami przez użytkownika i cyklem życia UI tworzą macierz przypadków brzegowych. Każda kombinacja musi zachowywać się poprawnie:

- Użytkownik zatrzymuje → nawigacja mówi → nadchodzi AudioFocus gain → aplikacja nie może wznawiać
- Strumień odpada → reconnect startuje → przychodzi połączenie → reconnect pauzuje → rozmowa kończy się → reconnect wznawia
- Użytkownik pauzuje → przełącza na AA → AA pokazuje stan zapauzowany → użytkownik wraca do telefonu → UI telefonu pokazuje stan zapauzowany
- Aplikacja jest w tle → system zabija UI → użytkownik klika powiadomienie → UI odtwarza się → natychmiast pokazuje poprawny stan

Żadnego z tych przypadków framework nie obsługuje. Każdy to świadoma decyzja w kodzie.

---

## 🏗 Architektura

### Warstwy systemu

```
┌──────────────────────────────────────────────────────────────┐
│                      Warstwa UI                             │
│  - RadioPage.xaml, StationPage.xaml, EditStationPage.xaml    │
│  - Interakcja użytkownika: Play, Stop, Next, Prev, wybór st. │
└───────────────▲──────────────────────────────────────────────┘
                │
                │  (komendy użytkownika)
                ▼
┌──────────────────────────────────────────────────────────────┐
│              Warstwa logiki aplikacji / MVVM                │
│  - RadioStateService.cs, StationService.cs, SettingsService │
│  - Stan odtwarzania, lista stacji, ustawienia               │
└───────────────▲──────────────────────────────────────────────┘
                │
                │  (zmiany stanu, powiadomienia)
                ▼
┌──────────────────────────────────────────────────────────────┐
│              Warstwa serwisu odtwarzania                    │
│  - AudioPlaybackService.cs (+ partial classes)              │
│  - Odpowiada za:                                            │
│    • Odtwarzanie (LibVLC)                                   │
│    • Foreground Service (Android)                           │
│    • Android Auto, BT, powiadomienia                        │
│    • Watchdog, reconnect, cellular fallback                 │
└───────────────▲──────────────────────────────────────────────┘
                │
                │  (komendy odtwarzania)
                ▼
┌──────────────────────────────────────────────────────────────┐
│                  Warstwa silnika LibVLC                     │
│  - LibVLCSharp, VideoLAN.LibVLC.Android                     │
│  - Natywne strumieniowanie audio, buforowanie, dekodowanie  │
└──────────────────────────────────────────────────────────────┘
```

### Mechanizmy stabilności i ochrony

| Mechanizm | Przed czym chroni |
|---|---|
| **Watchdog** | Ciche zawieszenia VLC — wykrywa brak aktywności audio, wyzwala reset |
| **Pętla Reconnect** | Utrata sieci — ponawia odtwarzanie z wykładniczym backoffem |
| **Cellular Fallback** | Martwy uplink Wi-Fi — wiąże z danymi mobilnymi, wraca gdy Wi-Fi odzyska internet |
| **Bezpieczne wątkowanie** | Deadlocki natywne — callbacki VLC wyzwalające VLC wysyłane do ThreadPool |
| **Bezpieczeństwo pamięci natywnej** | Crashe SIGSEGV — pollowanie i referencje Media anulowane przed zwolnieniem pamięci natywnej |
| **Ochrona Foreground Service** | ANR na Androidzie 12 — natychmiastowe `StartForeground` przy każdym `OnStartCommand` |
| **Synchronizacja stanu MVVM** | Ghost state UI — UI zawsze odzwierciedla rzeczywisty stan odtwarzania |

### Struktura plików

```
RadioAndroid/
├── RadioAndroid/
│   ├── App.xaml                — definicja aplikacji MAUI
│   ├── App.xaml.cs             — logika startu aplikacji
│   ├── MainPage.xaml           — główny shell/strona
│   ├── MainPage.xaml.cs        — logika głównej strony
│   ├── Views/
│   │   ├── RadioPage.xaml          — główny interfejs odtwarzacza
│   │   ├── RadioPage.xaml.cs       — logika głównego odtwarzacza
│   │   ├── StationPage.xaml        — lista stacji (widok listy i kafelków)
│   │   ├── StationPage.xaml.cs     — logika listy stacji
│   │   ├── EditStationPage.xaml    — dodawanie/edycja stacji, playlist, EQ
│   │   ├── EditStationPage.xaml.cs — logika dodawania/edycji
│   │   ├── HelpPage.xaml           — przewodnik użytkownika
│   │   └── HelpPage.xaml.cs        — logika przewodnika
│   ├── Services/
│   │   ├── RadioStateService.cs    — współdzielony stan odtwarzania (MVVM)
│   │   ├── StationService.cs       — logika wyboru stacji
│   │   └── SettingsService.cs      — persystowane ustawienia użytkownika
│   └── Models/
│       ├── Station.cs              — model stacji (nazwa + URL)
│       └── StacjaViewModel.cs      — ViewModel stacji (MVVM)
├── Platforms/Android/
│   ├── AudioPlaybackService.cs           — główny serwis (partial class)
│   ├── AudioPlaybackService.Playback.cs  — Play/Stop/Pause/HardReset, korektor
│   ├── AudioPlaybackService.Media.cs     — zdarzenia VLC, powiadomienia, metadane
│   ├── AudioPlaybackService.Reconnect.cs — pętla reconnect, łączność, cellular
│   ├── AudioPlaybackService.Queue.cs     — Next/Prev/zarządzanie kolejką
│   ├── AudioPlaybackService.Callbacks.cs — MediaSession + AudioFocus
│   ├── AudioPlaybackService.Cellular.cs  — cellular fallback, monitor odzysku Wi-Fi
│   ├── AudioPlaybackService.Watchdog.cs  — watchdog timer, śledzenie aktywności VLC
│   └── AndroidManifest.xml               — manifest aplikacji Android (uprawnienia, funkcje)
└── RadioAndroid.csproj                   — plik projektu .NET MAUI (zależności, konfiguracja)
```

`AudioPlaybackService` to `partial class` podzielona na 8 plików według odpowiedzialności.

| Plik | Odpowiedzialność |
|---|---|
| `AudioPlaybackService.cs` | Cykl życia serwisu, `OnCreate`, `OnStartCommand`, `OnDestroy`, `OnLoadChildren` |
| `AudioPlaybackService.Playback.cs` | `PlayRadio`, `StopRadio`, `PauseRadio`, `HardResetVlc`, korektor |
| `AudioPlaybackService.Reconnect.cs` | Pętla reconnect, wykładniczy backoff, zdarzenia łączności |
| `AudioPlaybackService.Media.cs` | Handlery zdarzeń VLC, pollowanie metadanych, powiadomienia |
| `AudioPlaybackService.Queue.cs` | Kolejka stacji, Next/Previous, `PlayFromQueueIndex` |
| `AudioPlaybackService.Callbacks.cs` | `AudioFocusChangeListener`, `RadioMediaSessionCallback` |
| `AudioPlaybackService.Cellular.cs` | Cellular fallback, monitor odzysku Wi-Fi, sonda HTTP |
| `AudioPlaybackService.Watchdog.cs` | Watchdog timer, śledzenie aktywności VLC |

Podział serwisu to nie była tylko decyzja organizacyjna — była odpowiedzią na realny problem. Jeden duży serwis ze wszystkimi odpowiedzialnościami wymieszanymi razem sprawiał że śledzenie cykli życia obiektów i wykrywanie wycieków pamięci było ekstremalnie trudne. Serwisy działające w tle na Androidzie mają długi czas życia — działają godzinami. Każdy obiekt który nie zostanie poprawnie zwolniony, każda subskrypcja zdarzenia która nie zostanie odsubskrybowana, każda referencja trzymana dłużej niż potrzeba — będzie się akumulować.

Oddzielenie logiki odtwarzania, reconnect, callbacków media session, zarządzania kolejką, cellular fallback, watchdoga i obsługi powiadomień do osobnych plików umożliwiło rozumowanie o każdej warstwie niezależnie. Wycieki pamięci w tej bazie kodu były znajdowane i naprawiane właśnie dlatego, że separacja czyniła je widocznymi.

---

### AndroidManifest.xml — Przegląd uprawnień

| Uprawnienie | Cel | Wymagane dla |
|---|---|---|
| `android.permission.INTERNET` | Zezwala aplikacji na dostęp do internetu. | Cała funkcjonalność strumieniowania |
| `android.permission.ACCESS_NETWORK_STATE` | Pozwala sprawdzać łączność sieciową. | Pętla reconnect, cellular fallback |
| `android.permission.WAKE_LOCK` | Utrzymuje CPU aktywny podczas odtwarzania w tle. | Zapobiega zatrzymaniu strumienia gdy urządzenie zasypia |
| `android.permission.FOREGROUND_SERVICE` | Pozwala uruchamiać foreground services (Android 8+). | Odtwarzanie w tle, powiadomienia |
| `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Foreground service dla odtwarzania mediów (Android 14+). | Zgodność z zasadami mediów Android 14+ |
| `android.permission.POST_NOTIFICATIONS` | Zezwala na wysyłanie powiadomień (Android 13+). | Powiadomienia odtwarzania, kontrolki mediów |

**Uwaga:** Niektóre uprawnienia (jak POST_NOTIFICATIONS) wymagają zgody w runtime na Androidzie 13+. Bez tych uprawnień aplikacja nie może strumieniować, odtwarzać w tle ani wyświetlać powiadomień.

---

## 🛠 Środowisko deweloperskie

Aplikacja powstała w całości w **Visual Studio 2026** z użyciem najnowszych frameworków Microsoft dostępnych w czasie tworzenia. To środowisko wystarczy do budowania, uruchamiania i testowania tego rodzaju aplikacji.

**Budowanie i podstawowe testy:**
Visual Studio 2026 z workloadem .NET MAUI pokrywa wszystko — budowanie, wdrażanie na fizyczne urządzenia i uruchamianie na wbudowanym emulatorze Android dla telefonów i tabletów.

**Testy rozszerzonych platform:**
Niektóre cele nie są dostępne w wbudowanym emulatorze Visual Studio i wymagają **Android Studio**:

- **Android Auto** — testowane przy użyciu emulatora Android Auto Desktop Head Unit (DHU), dostępnego tylko przez narzędzia SDK Android Studio
- **Android Desktop / ChromeOS** — testowane przy użyciu emulatora dużego ekranu Android w Android Studio
- **Android Automotive OS** — testowane przy użyciu emulatora AAOS (AVD Manager w Android Studio), który symuluje samochód z wbudowanym systemem Android bez telefonu

Testowane urządzenia fizyczne: telefony Android, TV boxy Android (używane jako dedykowane odtwarzacze samochodowe), głośniki Bluetooth i samochodowe head unity.

Visual Studio 2026 do tworzenia i Android Studio do rozszerzonych celów emulatorowych — razem pokrywają całą macierz platform. Żadne inne narzędzia nie są potrzebne.

---

## 📱 Wymagania

- **Android 8–16 (API 26–35)** — obsługiwany zakres
- .NET 10
- Połączenie internetowe (Wi-Fi, 4G, 5G)

## 📦 Kluczowe zależności

### Podstawowe (wszystkie platformy)

| Pakiet | Wersja | Cel |
|---|---|---|
| `Microsoft.Maui.Controls` | 10.0.50 | Framework UI .NET MAUI |
| `Microsoft.Maui.Essentials` | 10.0.50 | API platformy (Connectivity, Preferences, itd.) |
| `Microsoft.Maui.Graphics` | 10.0.50 | Prymitywy rysowania i grafiki |
| `Microsoft.Maui.Resizetizer` | 10.0.50 | Generowanie ikon/splash ze SVG dla platform |
| `Microsoft.Extensions.Logging.Debug` | 10.0.5 | Logowanie debug |
| `CommunityToolkit.Maui` | 14.0.1 | Rozszerzenia społeczności MAUI |
| `LibVLCSharp` | 3.9.6 | Bindingi C# dla silnika audio LibVLC |
| `Vlc.DotNet.Core` | 3.1.0 | Warstwa interop VLC .NET core — używana razem z `LibVLCSharp`, niewymienne |
| `Vlc.DotNet.Core.Interops` | 3.1.0 | Pomocniki natywnego interop VLC — część tego samego wymaganego zestawu |

### Tylko Android

| Pakiet | Wersja | Cel |
|---|---|---|
| `VideoLAN.LibVLC.Android` | 3.7.0-beta | Natywna biblioteka LibVLC (binaria `.so` dla ARM/x86). **Beta jest celowa** — to jedyna wersja, która kompiluje się poprawnie pod układ pamięci nowoczesnych urządzeń Android (ARMv8/64-bit). Stabilne wydanie 3.x generuje błędy linkera na aktualnym sprzęcie. Google Play przyjmuje i dystrybuuje ten build bez problemów. |
| `LibVLCSharp` | 3.9.6 | Bindingi C# dla LibVLC. Wymagane razem z `Vlc.DotNet.Core` — obie pełnią różne role i nie są wymienne. |
| `Vlc.DotNet.Core` | 3.1.0 | Warstwa interop VLC .NET core. Działa razem z `LibVLCSharp`, nie jako zamiennik. |
| `Vlc.DotNet.Core.Interops` | 3.1.0 | Pomocniki natywnego interop VLC. Część tego samego wymaganego zestawu. |
| `LibVLCSharp.Android.AWindowModern` | 3.9.6 | Integracja surface/window Android dla LibVLC |
| `Xamarin.AndroidX.Media` | 1.7.1.2 | `MediaBrowserServiceCompat` — wymagane dla Android Auto |
| `Xamarin.AndroidX.Lifecycle.*` | 2.10.0.2 | Musi być jawnie przypięte — patrz poniżej |
| `Xamarin.AndroidX.SavedState.SavedState.Ktx` | 1.4.0.2 | Rozszerzenia Kotlin SavedState (zależność AndroidX) |

> ⚠️ **Pinowanie wersji AndroidX.Lifecycle — wymagane do buildu**
>
> `Xamarin.AndroidX.Media` ma głębokie tranzytywne zależności od AndroidX Lifecycle. Bez jawnych pinów wersji NuGet pobiera konfliktujące wersje i build kończy się błędami typu `Duplicate class kotlin.collections.jdk8.*` lub `Cannot resolve symbol 'LifecycleOwner'`.
>
> Dodaj do swojego `.csproj`:

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

### Tylko Windows

| Pakiet | Wersja | Cel |
|---|---|---|
| `Microsoft.Maui.Graphics.Win2D.WinUI.Desktop` | 10.0.50 | Backend renderowania Win2D dla Windows |

---

## 👤 Autor

**Tomek Maslowski / tmfgroup**
2025–2026

Wesprzyj autora: [buycoffee.to/toevi](https://buycoffee.to/toevi)
🌐 [toevi.github.io/RadioAndroidPro](https://toevi.github.io/RadioAndroidPro/)

---

## 📄 Licencja

Aplikacja jest darmowa do użytku osobistego.

LibVLC jest używane na licencji [LGPL](https://www.videolan.org/legal.html).

Użytkownicy są odpowiedzialni za zapewnienie, że mają odpowiednie prawa dostępu do wszystkich dodawanych przez siebie strumieni.

---

*PS. Mały projekt, który miał być darmowym radiem do auta bez reklam — na własny użytek — przerodził się w aplikację na Google Play dla wszystkich. Kilka osób z YouTube i rodzina zainspirowali mnie i pomogli w najtrudniejszym momencie: przejściu przez testy i proces wydania w Google Play. Dziękuję Wam wszystkim.*
