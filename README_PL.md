# 📻 RadioAndroid PRO

🌐 **[Strona projektu i Google Play → toevi.github.io/RadioAndroidPro](https://toevi.github.io/RadioAndroidPro/)**

**Odtwarzacz radia internetowego na Android — aplikacja napisana w C# i .NET MAUI, napędzana natywnym silnikiem LibVLC za pośrednictwem powiązań C#.**

Bez Kotlina. Bez pluginów Gradle. Czysty C# od interfejsu użytkownika po integrację z silnikiem audio — silnikiem odtwarzania jest LibVLC, sprawdzony w boju silnik multimediów open-source, a nie coś napisanego od zera.

> **PRO** oznacza **P**ołatany, **R**ozwinięty i **O**ptymalizowany —
> nie jest to znaczek marketingowy, lecz uczciwy opis procesu deweloperskiego:
> błędy załatane, kod rozwinięty przez sześć miesięcy testów, silnik VLC zoptymalizowany pod kątem transmisji sieciowych na żywo.

> *Interfejs użytkownika — pięć stron — jest celowo zaprojektowany jako pilot zdalnego sterowania i nic więcej. Prawdziwa praca odbywa się w usługach działających w tle: zarządzanie silnikiem audio, odtwarzanie po awarii strumienia, integracja z Android Auto, obsługa sesji Bluetooth oraz synchronizacja stanu w całej aplikacji. Sprawienie, by to wszystko działało niezawodnie w C# i .NET MAUI — warstwie niennatywnej na szczycie Androida — było znacznie trudniejsze niż ekwiwalent w Kotlinie, gdzie API platformy są obywatelami pierwszej klasy. MAUI abstrahuje platformę, co jest wygodne, dopóki nie trzeba zagłębiać się w wewnętrzne mechanizmy Androida. Wtedy walczysz z frameworkiem tak samo jak z problemem. Efekt: jedna baza kodu w C#, która działa na telefonach, tabletach, Android TV, dekoderach TV, Android Desktop, Android Auto, Android Automotive OS, urządzeniach Bluetooth i ChromeOS — przetestowana i działająca na wszystkich z nich.*

> *Dlaczego C# i .NET MAUI? Ponieważ MAUI to wieloplatformowy framework UI — ta sama baza kodu może być kierowana na Androida, Windows i macOS bez przepisywania warstwy aplikacji. Kotlin i Gradle są wyłącznie dla Androida; z tamtej drogi nie ma migracji. W przypadku C# i MAUI port na pulpit Windows jest realistycznym kolejnym krokiem, a port na macOS wynika z tej samej logiki. Planowana jest wersja na Windows — prawdopodobnie ostatni kamień milowy przed uznaniem projektu za kompletny funkcjonalnie.*

> *Ta aplikacja płynie po niezbadanych wodach. Istnieje bardzo mało przykładów .NET MAUI + C# + LibVLC na Androida posuniętych tak daleko — w natywny fokus audio, usługi działające w tle, Android Auto i głęboką integrację z platformą. Niektóre rzeczy nie działały za pierwszym podejściem ani za drugim. Rozwiązania w tym README są wynikiem tego procesu — nie prostą linią od pomysłu do działającego kodu, ale mapą narysowaną podczas żeglugi.*

---

## Spis treści

Ten artykuł dokumentuje nie tylko ogólny opis aplikacji, ale także konkretne problemy techniczne i ich rozwiązania napotkane podczas dewelopmentu. Jeśli jesteś deweloperem, koniecznie sprawdź poniższe sekcje:

- Dwuwarstwowa ochrona strumienia (silnik VLC + logika aplikacji)
- Parametry VLC: buforowanie, reconnect, opcje silnika i na strumień
- Logika reconnectu: pętla reconnectu, watchdog, komórkowy fallback
- Lista stacji powyżej 10: paginacja i obsługa Android Auto
- Stabilność strumienia: trudny problem
- Techniczne deep dives (deadlocki natywne VLC, pamięć natywna, Android Foreground Service, integracja Android Auto)
- AudioFocus i synchronizacja stanu UI/Serwisu
- Korektor VLC w .NET MAUI (LibVLCSharp)
- Album Art w AAOS: Bitmap vs URI (przenoszenie z AA/BT do Automotive)
- **Dystrybucja Google Play AAOS: dlaczego APK działa, ale sklep odrzuca aplikację**
- **Android Automotive OS — dlaczego port został porzucony (polityka treści Automotive)**
- Lista kontrolna bezpieczeństwa pamięci LibVLCSharp (zapobieganie SIGSEGV, reguły czyszczenia)
- Architektura systemu i warstwy ochrony
- AndroidManifest.xml — przegląd uprawnień
- Struktura projektu i kluczowe zależności
- Środowisko deweloperskie
- Licencja i autor

---

### To nie jest Spotify, YouTube ani RadioTunes

Serwisy takie jak Spotify, YouTube czy RadioTunes są stabilne, ponieważ posiadają i kontrolują cały stos — infrastrukturę serwerową, protokół streamingowy, sieć dostarczania treści (CDN) i aplikację kliencką. Każdy komponent jest zaprojektowany tak, by współpracować z każdym innym komponentem. Jeśli coś się psuje, naprawiają obie strony. Niezawodność jest wbudowana w zamknięty system.

RadioAndroid to tylko klient. Nie ma kontroli nad stroną serwerową. Musi obsługiwać setki różnych serwerów radiowych, protokołów streamingowych (HTTP, HLS, AAC, MP3, Ogg, DASH, ICY i inne), konfiguracji serwerów i warunków sieciowych — żaden z nich nie był zaprojektowany z myślą o tym kliencie. Każda stacja to inne nieznane. Serwer może zerwać połączenie bez ostrzeżenia, wysłać zniekształcone nagłówki, zmienić bitrate w trakcie strumienia lub po prostu przejść offline. Klient musi przetrwać to wszystko z gracją.

To jest prawdziwe wyzwanie techniczne — i powód, dla którego stabilność strumienia wymagała głębokości pracy udokumentowanej w tym README. Każda pętla reconnectu, każdy timer watchdog, każde obejście wielowątkowe, każde zabezpieczenie pamięci natywnej istnieje dlatego, że po drugiej stronie nie ma współpracującego serwera. Tylko nieznany strumień, nieznany protokół i klient, który musi trwać niezależnie od okoliczności.

### Obsługiwane platformy

| Platforma | Uwagi |
|---|---|
| 📱 Telefony i tablety z Androidem | Android 8–16 (API 26–35) |
| 📺 Android TV / dekodery TV | Pełna obsługa — testowane na dekoderach TV z siecią LAN WiFi domową Chromecast |
| 🖥 Android Desktop | Obsługiwany — układ dla dużych ekranów skaluje się prawidłowo |
| 🚗 Android Auto | Przetestowany i zaakceptowany przez recenzję Google Play AA |
| 🚙 Android Automotive OS | Port porzucony — implementacja techniczna kompletna, ale niekompatybilna z polityką treści Google Play Automotive Android (patrz sekcja poniżej) |
| 🎵 Urządzenia Bluetooth | Słuchawki, głośniki, samochodowe head unity, elementy sterowania na kierownicy, odbiorniki HiFi — każde urządzenie BT korzystające z sesji mediów Androida. Zegarki Wear OS nie są obsługiwane. |

---

**Uwaga:** Aplikacja działa idealnie i bez żadnych ograniczeń na tabletach z natywnym Androidem (w tym montowanych fabrycznie w samochodach), z Android Auto, z Bluetooth car/head unit oraz na Android Automotive OS w wersji mobilnej (instalowanej na tablecie lub emulatorze). Możliwe jest pełne zarządzanie stacjami (dodawanie, edycja, usuwanie) zarówno w wersji mobilnej, jak i w wersji dostosowanej do AAOS. Jednak nawet po pełnym dostosowaniu do AAOS, aplikacja została odrzucona w Google Play na tej platformie, ponieważ polityka AAOS zabrania manipulacji (dodawania stacji) na ekranie samochodowym — mimo że technicznie jest to możliwe i działa bez zarzutu poza restrykcjami sklepu. Ograniczenie to nie dotyczy Android Auto, Bluetooth ani natywnych tabletów z Androidem.


## 🛡 Stabilność strumienia — trudny problem

**Tu RadioAndroid różni się od większości hobbystycznych aplikacji radiowych.**

Aplikacja jest zaprojektowana do pracy w samochodzie. W samochodzie utrata połączenia sieciowego nie jest przypadkiem brzegowym — jest rutyną. Tunele, martwe strefy, przełączanie między wieżami komórkowymi, przejście z Wi-Fi na LTE przy wyjeździe z domu, krótkie transmisje danych wyzwalane przez GPS, które uszczuplają bufor audio. Aplikacja radiowa, która nie przeżyje tego, jest bezużyteczna jako aplikacja samochodowa. Obsługa rozłączeń z gracją to nie dodatkowa funkcja — to wymaganie bazowe.

Streamowanie radia internetowego na Androidzie jest zwodniczo proste — dopóki przestaje nim być. Większość aplikacji działa dobrze przez kilka minut, a potem cicho umiera, gdy sieć chwilowo zaniknie, serwer zerwie połączenie lub telefon przełączy się z Wi-Fi na dane mobilne. Strumień po prostu... zatrzymuje się. Żadnego błędu, żadnego odtwarzania po awarii, żadnego dźwięku.

### Dlaczego tak się dzieje

LibVLC to potężny silnik audio, ale domyślnie traktuje każdy URL jak plik lokalny. Brak buforowania sieciowego, brak automatycznego reconnectu, brak tolerancji na dryfowanie zegarów w transmisjach na żywo. Pierwsza mikroprzerwa w sieci = strumień utracony.

Na dodatek VLC wyzwala swoje zdarzenia (Stopped — zatrzymany, EndReached — osiągnięto koniec, Error — błąd) na **natywnych wątkach**. Wywoływanie metod VLC (Stop, Play) wewnątrz tych callbacków powoduje **natywne deadlocki mutexów** — silnik audio zawiesza się permanentnie i jedynym sposobem na odtwarzanie jest zabicie procesu.

To nie są teoretyczne problemy. Są powodem, dla którego większość aplikacji radiowych LibVLCSharp + MAUI na GitHubie ma otwarte zgłoszenia o "strumień zatrzymuje się po kilku minutach" lub "aplikacja losowo zawiesza się".

### Jak RadioAndroid to rozwiązuje

**Dwuwarstwowa ochrona:**

**Warstwa 1 — Konfiguracja silnika VLC**

Silnik VLC jest skonfigurowany specjalnie pod kątem strumieni sieciowych na żywo, a nie plików lokalnych.

**Opcje na poziomie silnika** (stosowane raz przy inicjalizacji LibVLC — współdzielone przez wszystkie strumienie):

| Opcja | Co robi |
|---|---|
| `--network-caching=5000` | 5-sekundowy bufor sieciowy — pochłania jitter Wi-Fi i krótkie zaniki |
| `--live-caching=5000` | 5-sekundowy bufor strumienia na żywo — zapobiega underrunowi na źródłach live |
| `--http-reconnect` | VLC automatycznie ponawia połączenia HTTP po zerwaniu (pierwsza linia obrony) |
| `--sout-mux-caching=2000` | 2-sekundowy bufor na poziomie muxera dla strumieni multipleksowanych |
| `--clock-jitter=0` | Ignoruje dryft zegara — radio na żywo nie ma stabilnego zegara referencyjnego |
| `--clock-synchro=0` | Wyłącza synchronizację A/V — live = czas rzeczywisty, synchronizacja niepotrzebna |

**Opcje na strumień** (stosowane do każdego obiektu `Media` przed `Play()`):

| Opcja | Co robi |
|---|---|
| `:network-caching=5000` | Bufor sieciowy per strumień (wzmacnia ustawienie silnika) |
| `:live-caching=5000` | Bufor live per strumień |
| `:http-reconnect` | HTTP reconnect per strumień |
| `:adaptive-logic=highest` | HLS/DASH: wybiera najwyższą dostępną jakość |

> **Dlaczego oba poziomy?** Opcje silnika to wartości domyślne. Opcje per strumień zapewniają, że każdy nowy obiekt `Media` dziedziczy poprawne ustawienia, nawet jeśli VLC wewnętrznie resetuje wartości domyślne. Szelki i pasek.

**Warstwa 2 — Odtwarzanie po awarii na poziomie aplikacji (gdy VLC nie może samodzielnie naprawić problemu)**

- **Pętla reconnectu** — do 5 prób z wykładniczym backoffem (1s → 2s → 4s → 8s → 15s)
- **Timer watchdog** — wykrywa ciche zawieszenia VLC (brak aktywności audio przez 15 sekund) i wyzwala odtwarzanie po awarii
- **Komórkowy fallback** — jeśli Wi-Fi traci internet (typowe: router traci DNS/uplink), aplikacja wiąże proces z danymi mobilnymi i przełącza się z powrotem automatycznie, gdy Wi-Fi wróci
- **Twardy reset** — po 3 nieudanych cyklach odtwarzania po awarii, silnik VLC jest w pełni usuwany i odtwarzany od zera
- **Bezpieczne wątkowanie** — callbacki VLC wyzwalające logikę reconnectu (`EndReached`, `EncounteredError`) są przekazywane do puli wątków przez `ThreadPool.QueueUserWorkItem`, nigdy nie wywołując metod VLC na natywnych wątkach (zapobiega deadlockowi, który zabija większość integracji LibVLC). Callbacki dotyczące wyłącznie stanu (`Playing`, `Paused`, `Stopped`) działają bezpośrednio, ale nigdy nie wywołują zwrotnie VLC.
- **Bezpieczeństwo pamięci natywnej** — odpytywanie metadanych i referencje do mediów są czyszczone *przed* zwolnieniem pamięci natywnej, zapobiegając awariom use-after-free

Jeśli wszystko zawiedzie, odtwarzanie zatrzymuje się czysto z komunikatem o statusie. Naciśnij Play, aby spróbować ponownie.

### Stop użytkownika = Stop

Gdy naciśniesz Stop lub Pauzę, aplikacja **pozostaje zatrzymana**. Zmiany sieciowe (przełączanie Wi-Fi, wejście do domu) nie wyzwolą niechcianego auto-play. System reconnectu jest aktywny tylko gdy aplikacja faktycznie próbuje odtwarzać.

> **Znane ograniczenie:** W pewnych przypadkach brzegowych — przełączanie sieci między Wi-Fi a danymi mobilnymi, odłączenie Bluetooth lub Android Auto w trakcie strumienia — pętla reconnectu może kontynuować bez ustawienia flagi stopu. W tych przypadkach ręczne naciśnięcie Stop kończy odtwarzanie. Te przypadki zostały zidentyfikowane podczas codziennych testów użytkowania i naprawione.

> *To jest projekt, nie skończony produkt. Błędy są naprawiane na bieżąco w miarę jak się pojawiają — napędzane rosnącą liczbą użytkowników, urządzeń i platform. Każde nowe urządzenie, każda nowa wersja Androida, każdy nowy head unit to potencjalny nowy przypadek brzegowy. Taka jest natura uniwersalnego klienta działającego na sprzęcie, którego nigdy wcześniej nie widział.*

---

## 🔧 Techniczne Deep Dives

Jeśli uważasz, że połączenie C#, .NET MAUI, LibVLC, Android Foreground Service i Android Auto w aplikację radiową brzmi jak projekt hello world — ta sekcja jest odpowiedzią na to. Tak to się zaczęło. Okazało się kolizją z hardcorowym światem.

Ta sekcja dokumentuje sześć najtrudniejszych problemów napotkanych podczas budowania RadioAndroid PRO z LibVLCSharp + .NET MAUI na Androidzie. Żaden z nich nie ma kompletnego przykładu w żadnej oficjalnej dokumentacji. Każdy z nich został znaleziony przez crashe, sesje z natywnym debuggerem i czytanie kodu źródłowego C LibVLC.

Jeśli budujesz aplikację radiową lub audio z tym stosem i uderzasz w ściany, to jest dla ciebie.

---

### 1. Natywny deadlock wątku LibVLC

**Objaw**

Aplikacja całkowicie się zawiesza. Brak crashu, brak wyjątku, brak wyjścia w logach. Silnik audio zawiesza się permanentnie, a jedynym odtwarzaniem po awarii jest zabicie procesu. Dzieje się to pozornie losowo — często po zdarzeniu sieciowym, błędzie strumienia lub przełączeniu stacji.

**Przyczyna źródłowa**

VLC wyzwala swoje zdarzenia odtwarzania (`EndReached`, `Stopped`, `EncounteredError`, `Playing`) na **natywnych wątkach C** — nie na zarządzanej puli wątków .NET, nie na głównym wątku Androida. Są to surowe wątki pthreads wewnątrz silnika VLC.

Natywny silnik VLC trzyma wewnętrzne mutexy podczas dyspatchowania tych zdarzeń. Jeśli wywołasz **jakąkolwiek** metodę VLC (włącznie z `Stop()`, `Play()`, `Media = null`) z wnętrza handlera zdarzenia, VLC próbuje przejąć te same mutexy, które są już trzymane przez dispatch zdarzeń. Klasyczny deadlock. Wątek audio czeka w nieskończoność. Silnik jest zamrożony.

Jest to wspomniane w jednym zdaniu w dokumentacji LibVLCSharp. Nie ma żadnych przykładów pokazujących poprawny wzorzec dla aplikacji produkcyjnej.

**Zły wzorzec — nie rób tego**

```csharp
_mediaPlayer.EndReached += (sender, e) =>
{
    // ❌ DEADLOCK — to działa na natywnym wątku VLC
    // VLC trzyma wewnętrzne mutexy podczas wyzwalania tego zdarzenia
    _mediaPlayer.Stop();       // próbuje przejąć te same mutexy → zamrożenie
    _mediaPlayer.Media = null; // ten sam problem
    StartReconnect();          // jeśli to wywołuje Play() → zamrożenie
};
```

Ten wzorzec pojawia się w większości przykładów LibVLCSharp na GitHubie i Stack Overflow. Działa dobrze w demach, gdzie ręcznie klikasz przyciski. Deadlockuje niezawodnie w produkcji pod obciążeniem.

**Poprawny wzorzec**

Natychmiast przekaż poza natywny wątek. Nie wywołuj żadnej metody VLC przed opuszczeniem callbacku.

```csharp
_mediaPlayer.EndReached += (sender, e) =>
{
    // ✅ Natychmiast zejdź z natywnego wątku — tu bez wywołań VLC
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
    // ✅ Teraz na puli wątków — bezpieczne wywołanie metod VLC
    _mediaPlayer.Stop();
    _mediaPlayer.Media = null;
    StartReconnect();
}
```

`Task.Run()` to minimalna naprawa — ilustruje zasadę: zejdź z natywnego wątku przed wywołaniem czegokolwiek związanego z VLC. Implementacja produkcyjna używa `ThreadPool.QueueUserWorkItem()` dla callbacków wyzwalających logikę reconnectu (`EndReached`, `EncounteredError`) — jest lżejsza niż `Task.Run()`, ponieważ nie tworzy pełnego obiektu `Task` z maszynerią anulowania, co jest niepotrzebne dla callbacków fire-and-forget VLC. Zasada jest identyczna; wybór jest optymalizacją.

**Dodatkowe reguły**

- Nigdy nie wywołuj `_mediaPlayer.Stop()`, `_mediaPlayer.Play()` ani `_mediaPlayer.Media = X` z wnętrza żadnego handlera zdarzenia VLC, nawet pośrednio przez wywołania metod.
- Jeśli używasz `Dispatcher.Dispatch()` lub `MainThread.BeginInvokeOnMainThread()`, upewnij się, że nie wywołujesz metod VLC na wątku UI — przekazanie do wątku UI nie rozwiązuje problemu, jeśli wątek UI następnie wywołuje z powrotem VLC, gdy natywny wątek nadal jest w fazie dispatchu zdarzeń.
- Bezpieczny wzorzec to zawsze: natywne zdarzenie VLC → `Task.Run()` → twoja logika.

---

### 2. SIGSEGV z natywnej pamięci LibVLCSharp

**Objaw**

Aplikacja crashuje z `SIGSEGV` (sygnał 11) — natywny błąd segmentacji. Pojawia się w logu crashu jako crash wewnątrz natywnego kodu LibVLC, nie w twoim kodzie C#. Stack trace wskazuje na wewnętrzne mechanizmy VLC. Jest nieregularny i trudny do konsekwentnego odtworzenia. Często zdarza się podczas przełączania stacji, szybkich sekwencji play/stop lub gdy aplikacja przechodzi do tła.

**Przyczyna źródłowa**

LibVLCSharp opakowuje natywne obiekty C (`libvlc_media_t`, `libvlc_media_player_t`) za uchwytami C#. Kluczowy punkt: **gdy ustawisz `MediaPlayer.Media = null`, pamięć natywna poprzedniego obiektu `Media` jest natychmiast zwalniana**.

Ale "zwolniona" na poziomie natywnym nie oznacza "zwolniona" na poziomie C#. Każdy kod C# nadal trzymający referencję do starego `Media` — handlery zdarzeń, pętle pollingu w tle, czytniki metadanych — teraz trzyma wskaźnik do zwolnionej pamięci natywnej. Następny dostęp to crash use-after-free na poziomie C, który pojawia się jako SIGSEGV.

To jest problem granicy natywnej/zarządzanej. GC zarządza obiektami C#, ale nie ma widoczności w pamięci natywnej. Pamięć natywna jest zwalniana gdy LibVLC decyduje się ją zwolnić, a nie gdy GC zbiera opakowanie C#.

**Scenariusz crashu**

```csharp
// Polling metadanych w tle — działa co 2 sekundy
private async Task PollMetadataAsync()
{
    while (true)
    {
        await Task.Delay(2000);
        // ❌ Jeśli Media zostało ustawione na null między opóźnieniem a tą linią,
        // pamięć natywna jest już zwolniona → SIGSEGV
        var title = _mediaPlayer.Media?.Meta(MetadataType.Title);
    }
}

// Tymczasem, przy przełączaniu stacji:
private void SwitchStation(string url)
{
    _mediaPlayer.Stop();
    _mediaPlayer.Media = null; // ← tutaj pamięć natywna jest zwalniana
    _mediaPlayer.Media = new Media(_libVlc, new Uri(url));
    _mediaPlayer.Play();
}
```

Operator null-conditional `?.` nie chroni cię tutaj. Właściwość `Media` C# może zwrócić niezerowy obiekt opakowujący, gdy bazowa pamięć natywna jest już zwolniona. Crash zdarza się wewnątrz natywnego wywołania, które następuje po.

**Poprawny wzorzec**

Wyczyść wszystkie referencje i zatrzymaj cały polling *przed* zwolnieniem pamięci natywnej. Użyj flagi guard, aby zapobiec ponownemu wejściu.

> **Uwaga o `Thread.Sleep(50)`:** Pauza 50ms w poniższym wzorcu jest celowa — to nie jest hack ani obejście. LibVLC ma znane wewnętrzne mikrozamrożenie podczas natywnego demontażu mediów. Bez tej pauzy token anulowania jest ustawiony, ale pętla pollingu nie miała jeszcze szansy go zaobserwować i wyjść przed zwolnieniem pamięci natywnej. 50ms to minimalny niezawodny przedział okna przetestowany w produkcji; usunięcie go przywraca crashe SIGSEGV.

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
    // ✅ Krok 1: Zasygnalizuj wszystkim konsumentom, aby się zatrzymali
    _mediaReleasing = true;

    // ✅ Krok 2: Anuluj i poczekaj na zatrzymanie pollingu
    _metadataCts?.Cancel();
    _metadataCts?.Dispose();

    // ✅ Krok 3: Daj zadaniom w tle chwilę na wyjście
    // Thread.Sleep(50) jest tu celowy — nie jest hackiem.
    // LibVLC ma znane wewnętrzne mikrozamrożenie podczas demontażu mediów po stronie natywnej.
    // Bez tej pauzy token anulowania jest ustawiony, ale pętla pollingu nie miała
    // szansy go zaobserwować i wyjść przed zwolnieniem poniżej pamięci natywnej.
    // 50ms to minimalne niezawodne okno; usunięcie go przywraca crashe SIGSEGV.
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

**Kluczowe reguły**

- Zawsze anuluj i czekaj na (lub synchronicznie poczekaj na) zakończenie każdej pętli w tle, która uzyskuje dostęp do `Media` lub `MediaPlayer` przed ustawieniem `Media = null`.
- Jawnie usuń stary obiekt `Media`. Nie polegaj na GC — pamięć natywna nie jest zarządzana przez GC.
- Flaga guard `_isStartingPlayback` (sprawdzana wewnątrz `lock (_commandGate)`) zapobiega korupcji nowego stanu odtwarzania przez callback `Stopped` podczas sekwencji Play→Stop→Play.
- Kolejność czyszczenia — anuluj `_metaPollCts`, odepnij handler `MetaChanged`, wyzeruj `_currentMediaForMeta`, następnie `Stop()`/`Media = null` — musi być przestrzegana we wszystkich ścieżkach kodu, które resetują odtwarzacz (`PlayRadio`, `StopRadio`, `HardResetVlc`, `OnDestroy`).
- Nigdy nie uzyskuj dostępu do `Media.Meta()` ani żadnej innej metody `Media` po ustawieniu `MediaPlayer.Media` na null lub zastąpieniu.

---

### 3. Crash Foreground Service na Androidzie 12 / 12.1 (API 31–32)

**Objaw**

Aplikacja crashuje specyficznie na urządzeniach z Androidem 12 i 12.1. Crash to `ForegroundServiceDidNotStartInTimeException` lub `RemoteServiceException`. Zdarza się podczas przełączania stacji, nie tylko przy pierwszym starcie. Ten sam kod działa dobrze na Androidzie 13+ (API 33+). Na Androidzie 11 i niżej też działa dobrze.

**Przyczyna źródłowa**

Android 12 wprowadził ścisłą regułę: po wywołaniu `startForegroundService()`, serwis musi wywołać `startForeground()` **w ciągu 5 sekund**, lub system zabija go crashem w stylu ANR.

Ta reguła jest dobrze udokumentowana. Co nie jest udokumentowane: **dotyczy każdego intentu dostarczonego do serwisu**, nie tylko pierwszego startu. Gdy przełączasz stacje, zazwyczaj wysyłasz nowy intent do działającego serwisu z nowym URL-em. Serwis odbiera ten intent przez `OnStartCommand()`. Na Androidzie 12 pięciosekundowy zegar restartuje się przy każdym takim intencie. Jeśli twój `OnStartCommand()` wykonuje jakąkolwiek pracę asynchroniczną przed ponownym wywołaniem `startForeground()`, trafiasz w timeout.

Dodatkowo, `API 31–32` ma zepsutą interakcję z `StopForeground()`. Wywołanie `StopForeground(true)` na API 31–32 w pewnych sekwencjach może powodować `IllegalArgumentException`. Poprawka (`StopForegroundCompat()`) wymaga shima kompatybilności, który zachowuje się inaczej na API 31–32 vs API 33+.

**Sekwencja crashu na API 31–32**

```csharp
// ❌ To działa na API 33+, crashuje na API 31-32
[return: GeneratedEnum]
public override StartCommandResult OnStartCommand(Intent intent, StartCommandFlags flags, int startId)
{
    var url = intent.GetStringExtra("station_url");

    // Tutaj jakaś asynchroniczna praca przygotowawcza...
    Task.Run(async () =>
    {
        await PrepareMediaAsync(url); // ← tu przerwa asynchroniczna
        StartForeground(NotificationId, BuildNotification()); // ← za późno na API 31-32
        _mediaPlayer.Play();
    });

    return StartCommandResult.Sticky;
}
```

**Poprawny wzorzec dla API 31–32**

Wywołaj `StartForeground()` **synchronicznie i natychmiast** na początku `OnStartCommand()`, przed jakąkolwiek pracą asynchroniczną. Zaktualizuj zawartość powiadomienia później.

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

**Podsumowanie reguł dla Foreground Services w aplikacjach audio**

| Scenariusz | Reguła |
|---|---|
| Inicjalne `startForegroundService()` | Wywołaj `startForeground()` w ciągu 5 sekund |
| Przełączenie stacji (nowy intent do działającego serwisu) | Wywołaj `startForeground()` ponownie na początku `OnStartCommand()` — pięciosekundowy zegar resetuje się |
| `StopForeground()` na API 31–32 | Użyj przeciążenia `bool` lub shima kompatybilności — enum `StopForegroundFlags` ma problemy na tych poziomach API |
| API 33+ | `StopForeground(StopForegroundFlags.Remove)` działa poprawnie |

> **Wskazówka testowa:** Zawsze testuj specyficznie na API 31 lub 32. Emulatory są tu w porządku — problem jest odtwarzalny na każdym obrazie API 31–32. Emulatory API 33+ nie ujawnią tego błędu.

---

### 4. MediaBrowserServiceCompat i Android Auto

**Objaw**

Aplikacja przechodzi certyfikację AA na papierze, ale zachowuje się nieoczekiwanie na head unitach: lista stacji jest obcinana przy 10 pozycjach, nawigacja nieoczekiwanie się zapętla, aktualizacje metadanych opóźniają się lub sesja mediów przestaje reagować na sprzętowe elementy sterowania po okresie nieaktywności.

**Przyczyna źródłowa (wiele problemów)**

Android Auto wymaga działającej implementacji `MediaBrowserServiceCompat`. Powiązania C# Xamarin/MAUI dla `androidx.media` są niekompletne i słabo udokumentowane. Problemy kumulują się: kilka zachowań, które działają poprawnie w świecie Java/Kotlin, po prostu nie ma kompletnych przykładów C# nigdzie.

#### Problem A: Limit listy stacji — dlaczego stacje powyżej 10 znikają

**Objaw**

Masz 20 lub 30 stacji. W interfejsie Android Auto widocznych jest tylko 10. Stacje od 11 w górę po prostu znikają — brak przewijania powyżej 10, brak przycisku "wczytaj więcej", brak błędu. Lista jest cicho obcinana.

**Dlaczego tak się dzieje**

`MediaBrowser` Android Auto stosuje limit na stronę podczas ładowania wyników `OnLoadChildren()`. Domyślny rozmiar strony wynosi **10 elementów**. Nie jest to twardy limit wbudowany w protokół — jest to ustawienie per head unit, które różni się między implementacjami — ale w praktyce większość head unitów i oficjalny emulator DHU paginuje po 10.

Gdy head unit obsługuje paginację, wywołuje **trójargumentowe** przeciążenie `OnLoadChildren` i przekazuje `Bundle` z dwoma kluczami:

```csharp
// Te stałe są w MediaBrowserCompat:
// MediaBrowserCompat.ExtraPage      — zerowy indeks strony (0 = pierwsza strona)
// MediaBrowserCompat.ExtraPageSize  — ile elementów na stronę
```

Jeśli twój serwis nadpisuje tylko **dwuargumentową** wersję `OnLoadChildren(string parentId, Result result)`, te parametry paginacji są cicho odrzucane. System wraca do twojej implementacji, która zwraca wszystkie elementy — ale head unit wyświetla tylko pierwszą stronę z nich. Reszta jest odbierana, ale odrzucana.

**Zły wzorzec — płaska lista w rocie**

```csharp
// ❌ Płaska lista — działa dobrze przy 8 stacjach, cicho gubi stacje 11+ na większości head unitów
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

Działa poprawnie podczas testowania z małą listą. Zawodzi cicho w produkcji, gdy lista przekracza rozmiar strony head unitu.

**Poprawny wzorzec — dwupoziomowa hierarchia przeglądania**

Niezawodna poprawka to nie implementacja paginacji (która pozostaje zależna od head unitu i wymaga testowania na każdym urządzeniu docelowym), ale użycie **dwupoziomowej struktury przeglądania**: poziom root zawiera jeden folder przeglądania, a wszystkie stacje żyją wewnątrz tego folderu.

Android Auto zawsze ładuje poziom root w całości — folder zajmuje jeden slot. Gdy użytkownik dotknnie folder, `OnLoadChildren` jest wywoływane ponownie z ID folderu i wszystkie stacje są zwracane do tego drugiego poziomu. Ponieważ wywołanie drugiego poziomu również paginuje po 10, duże listy nadal korzystają z obsługi paginacji na drugim poziomie — ale co kluczowe, użytkownicy zawsze mogą dotrzeć do folderu i zobaczyć wszystkie stacje, przewijając wewnątrz niego.

```
Root (__ROOT__)
└── 📁 "Wszystkie stacje"  ← FlagBrowsable — dotknięcie wyzwala OnLoadChildren(__ALL_STATIONS__)
    ├── 📻 Stacja 1        ← FlagPlayable
    ├── 📻 Stacja 2
    ├── ...
    └── 📻 Stacja 30
```

```csharp
private const string BrowseIdAllStations = "__ALL_STATIONS__";

public override void OnLoadChildren(string parentId, Result result)
{
    var mediaItems = new List<MediaBrowserCompat.MediaItem>();

    if (parentId == "__ROOT__")
    {
        // ✅ Root: jeden folder przeglądania — zawsze widoczny niezależnie od rozmiaru strony
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
        // ✅ Kategoria: wszystkie stacje — zwracane w całości; head unit paginuje je w razie potrzeby
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

**Implementacja trójargumentowego przeciążenia dla head unitów, które żądają jawnej paginacji**

Niektóre head unity wywołują bezpośrednio wersję trójargumentową. Aby obsłużyć to poprawnie, nadpisz ją i respektuj parametry strony/rozmiaru:

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

    // Fallback do przeciążenia bez paginacji dla root i nieznanych ID
    OnLoadChildren(parentId, result);
}
```

**Podpowiedzi stylu treści — wyświetlanie w siatce vs liście**

Android Auto i AAOS obsługują podpowiedzi wyświetlania, które kontrolują, czy elementy są wyświetlane jako siatka (kafelki) czy lista. Są ustawiane przez extras w `BrowserRoot` zwracanym z `OnGetRoot()`:

```csharp
// Wartości: 1 = lista, 2 = siatka
private const int ContentStyleList = 1;
private const int ContentStyleGrid = 2;

public override BrowserRoot OnGetRoot(string clientPackageName, int clientUid, Bundle rootHints)
{
    var extras = new Bundle();
    // Pokaż elementy przeglądania (foldery) jako listę
    extras.PutInt("android.media.browse.CONTENT_STYLE_BROWSABLE_HINT", ContentStyleList);
    // Pokaż elementy odtwarzania (stacje) jako listę
    extras.PutInt("android.media.browse.CONTENT_STYLE_PLAYABLE_HINT", ContentStyleList);
    return new BrowserRoot("__ROOT__", extras);
}
```

Dla aplikacji radiowej, gdzie nazwy stacji są głównym identyfikatorem, styl listy jest bardziej czytelny niż siatka. Siatka działa lepiej, gdy masz niestandardową grafikę dla każdego elementu.

**Podsumowanie — reguła paginacji**

| Scenariusz | Zachowanie bez poprawki hierarchii | Zachowanie z dwupoziomową hierarchią |
|---|---|---|
| 8 stacji | Wszystkie 8 widocznych ✅ | Wszystkie 8 widocznych ✅ |
| 12 stacji | Pierwszych 10 widocznych, 2 utracone ❌ | Folder zawsze widoczny; wszystkie 12 dostępnych wewnątrz ✅ |
| 50 stacji | Pierwszych 10 widocznych, 40 utraconych ❌ | Folder zawsze widoczny; wszystkie 50 dostępnych, paginowanych wewnątrz ✅ |

> **Wskazówka testowa:** Użyj emulatora Android Auto Desktop Head Unit (DHU) z listą stacji większą niż 10, aby odtworzyć obcinanie. DHU domyślnie wymusza limit strony 10 elementów i jest najbardziej niezawodnym sposobem walidacji zachowania paginacji bez fizycznego head unitu.

#### Problem B: Kołowa nawigacja przy Następna/Poprzednia

W interfejsie Android Auto nie ma widocznego wskaźnika końca listy. Gdy twoja logika Następna/Poprzednia przechodzi z ostatniej stacji z powrotem do pierwszej (lub odwrotnie), użytkownicy nie mają możliwości wiedzieć, że przeszli cykl. Jest to celowe zachowanie aplikacji do użytku w samochodzie, ale nieoczywiste w interfejsie AA.

Udokumentuj to w swoim `OnMediaButtonEvent` / zarządzaniu kolejką, aby przyszłe osoby utrzymujące kod nie "naprawiały" zawijania:

```csharp
private int GetNextStationIndex(int currentIndex)
{
    // Celowe kołowe zawijanie — w Android Auto nie ma wskaźnika końca listy
    // Ostatnia stacja → zawija do pierwszej; Pierwsza stacja ← zawija do ostatniej
    return (currentIndex + 1) % _stations.Count;
}
```

#### Problem C: Pinowanie wersji AndroidX.Lifecycle

`MediaBrowserServiceCompat` przez `Xamarin.AndroidX.Media` ma głębokie zależności przechodnie na AndroidX Lifecycle. Domyślna rozdzielczość zależności NuGet wciąga sprzeczne wersje pakietów podrzędnych Lifecycle, powodując błędy kompilacji wyglądające jak `Duplicate class kotlin.collections.jdk8.*` lub `Cannot resolve symbol 'LifecycleOwner'`.

Poprawka to jawne przypięcie wszystkich pakietów Lifecycle w swoim `.csproj`. Pełna lista wymaganych odwołań do pakietów z poprawnymi wersjami jest udokumentowana w sekcji **Kluczowe zależności** poniżej.

#### Problem D: Sesja mediów przestaje odpowiadać

Jeśli twój token `MediaSession` nie jest poprawnie połączony z `MediaBrowserServiceCompat.SessionToken`, sprzętowe przyciski mediów (elementy sterowania na kierownicy, Bluetooth HID) przestają działać po timeoucie sesji head unitu.

```csharp
public override void OnCreate()
{
    base.OnCreate();

    _mediaSession = new MediaSessionCompat(this, "RadioAndroidPRO");
    _mediaSession.SetCallback(new MediaSessionCallback(this));
    _mediaSession.SetFlags(
        MediaSessionCompat.FlagHandlesMediaButtons |
        MediaSessionCompat.FlagHandlesTransportControls);

    // ✅ Ta linia jest obowiązkowa — łączy sesję z serwisem przeglądania
    // Bez niej, AA i elementy sterowania Bluetooth działają początkowo, ale przestają po nieaktywności
    SessionToken = _mediaSession.SessionToken;

    _mediaSession.IsActive = true;
}
```

---

### 5. Korektor VLC w .NET MAUI (LibVLCSharp)

**Obsługa korektora w LibVLCSharp jest funkcjonalna, ale nie w pełni udokumentowana.**
Poniżej znajduje się praktyczny przewodnik do integracji i kontrolowania korektora VLC w aplikacji .NET MAUI.

#### Jak to działa

LibVLC udostępnia API korektora przez klasy `AudioEqualizer` i `MediaPlayer`. Możesz utworzyć korektor, ustawić wzmocnienia pasm i przypisać go do odtwarzacza.

#### Przykład: Konfigurowanie korektora (9 pasm w UI, do 10 obsługiwanych przez VLC)

```csharp
using LibVLCSharp.Shared;

// Utwórz instancję korektora
var equalizer = new AudioEqualizer();

// Ustaw wzmocnienie dla każdego pasma (przykładowe wartości)
equalizer.SetAmp(0, 3.0f); // Pasmo 0: +3dB
equalizer.SetAmp(1, -2.0f); // Pasmo 1: -2dB
// ... powtórz dla innych pasm w razie potrzeby

// Opcjonalnie ustaw preamp
equalizer.Preamp = 0.0f;

// Przypisz korektor do MediaPlayer
mediaPlayer.SetEqualizer(equalizer);

// Aby wyłączyć korektor:
mediaPlayer.SetEqualizer(null);
```

#### Praktyczne uwagi

- Liczba pasm i częstotliwości: Użyj `AudioEqualizer.BandCount` i `AudioEqualizer.GetBandFrequency(int band)` do zapytania o dostępne pasma i ich częstotliwości.
- Możesz utworzyć niestandardowy UI (np. suwaki) w MAUI i powiązać ich wartości z `SetAmp(band, gain)`.
- Korektor może być zmieniany w czasie wykonania; zmiany mają efekt natychmiastowy.
- Zawsze sprawdzaj nulle i obsługuj wyjątki, szczególnie podczas przełączania strumieni lub usuwania odtwarzacza.

#### Przykład: Wyświetlanie częstotliwości pasm

```csharp
for (int i = 0; i < AudioEqualizer.BandCount; i++)
{
    float freq = AudioEqualizer.GetBandFrequency(i);
    Console.WriteLine($"Pasmo {i}: {freq} Hz");
}
```

**Wskazówka:** Zintegruj elementy sterowania korektorem w `EditStationPage.xaml` lub dedykowanej stronie ustawień do regulacji przez użytkownika.

**Dokumentacja:** [LibVLCSharp AudioEqualizer API](https://code.videolan.org/videolan/LibVLCSharp/-/blob/master/LibVLCSharp/AudioEqualizer.cs)

---

### 6. AudioFocus i synchronizacja stanu UI/Serwisu

To jeden z najtrudniejszych problemów w ogólnym dewelopmencie audio na Androidzie — i znacznie trudniejszy w .NET MAUI niż w Kotlinie, gdzie platforma zapewnia narzędzia pierwszej klasy dokładnie dla tego scenariusza.

**Problem**

Aplikacja radiowa nie żyje w izolacji. Android to system wielozadaniowy, a fokus audio jest zasobem współdzielonym. W każdej chwili inna aplikacja lub sam system może przerwać odtwarzanie: przychodząca wiadomość SMS wyzwala dźwięk powiadomienia, nawigacja Android Auto zaczyna mówić wskazówki zakrętowe, użytkownik otwiera YouTube lub inny odtwarzacz mediów, przychodzi połączenie telefoniczne. Każde z tych zdarzeń wysyła sygnał AudioFocus do aplikacji. Aplikacja musi zareagować poprawnie — pauzować lub obniżyć głośność (ducking) — a następnie wiedzieć kiedy i czy wznowić.

Na dodatek, UI i usługa działająca w tle to oddzielne komponenty z oddzielnymi cyklami życia. Serwis działa nieprzerwanie w tle. UI może być niszczony i odtwarzany w dowolnym momencie — użytkownik przełącza się na inną aplikację, system zabija UI, aby odzyskać pamięć, ekran się obraca, użytkownik dotyka powiadomienia i wraca do aplikacji. Za każdym razem gdy UI wraca, musi ponownie połączyć się z serwisem i przywrócić dokładnie bieżący stan: która stacja gra, czy jest zatrzymana, co pokazują metadane strumienia. Nieświeży lub ghost stan UI — pokazujący "odtwarzanie" gdy serwis jest zatrzymany lub złą nazwę stacji — to prawdziwy błąd, który dezorientuje użytkowników.

W Kotlinie jest to rozwiązane przez LiveData, ViewModel i komponenty architektury cyklu życia Androida — wszystkie zaprojektowane do przetrwania odtworzenia UI i automatycznego wiązania ze stanem serwisu. W MAUI nic z tego nie istnieje. Framework abstrahuje platformę, co oznacza, że abstrahuje również te narzędzia. Wszystko musi być zbudowane ręcznie.

**Obsługa AudioFocus — co musi być pokryte**

Android wysyła różne zdarzenia AudioFocus w zależności od tego, co się dzieje, i każde wymaga innej odpowiedzi:

- `AUDIOFOCUS_LOSS` — inna aplikacja trwale przejęła fokus (użytkownik uruchomił YouTube, odtwarzacz mediów). Aplikacja musi zatrzymać odtwarzanie i nie wznawiać automatycznie. Wznowienie bez zaproszenia po tym, jak użytkownik wybrał inną aplikację, to poważne naruszenie UX.
- `AUDIOFOCUS_LOSS_TRANSIENT` — fokus utracony tymczasowo (połączenie telefoniczne, ogłoszenie nawigacyjne). Aplikacja musi zatrzymać i wznowić automatycznie po powrocie fokusu.
- `AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK` — inna aplikacja krótko potrzebuje audio przy niskiej głośności (dźwięk powiadomienia). Aplikacja może zamiast tego zmniejszyć głośność (ducking), a następnie przywrócić ją.
- `AUDIOFOCUS_GAIN` — fokus powrócił. Aplikacja musi wznowić jeśli była zatrzymana z powodu tymczasowej utraty, ale nie może wznowić jeśli użytkownik ręcznie zatrzymał odtwarzanie lub fokus został utracony permanentnie.

Kluczowe rozróżnienie to między zatrzymaniem zainicjowanym przez użytkownika a zatrzymaniem zainicjowanym przez system. Logika reconnectu i logika wznawiana przez AudioFocus nigdy nie mogą się nakładać — naciśnięcie Stop przez użytkownika musi zawsze wygrać, niezależnie od tego jakie sygnały AudioFocus napływają później.

**Synchronizacja UI/Serwisu — co musi być pokryte**

Gdy UI jest odtwarzany lub użytkownik wraca do aplikacji, poniższe muszą być wszystkie przywrócone poprawnie i natychmiast:

- Aktualny stan odtwarzania (odtwarzanie, pauza, zatrzymanie, reconnect)
- Aktualna nazwa stacji i metadane (tytuł strumienia, artysta jeśli dostępny)
- Poprawny stan wizualny wszystkich elementów sterowania (przycisk play, nazwa stacji, tekst statusu)
- Stan interfejsu Android Auto — jeśli head unit samochodowy jest podłączony, ma własny UI, który musi również odzwierciedlać bieżący stan

Synchronizacja musi działać we wszystkich punktach wejścia: użytkownik dotyka ikony aplikacji, użytkownik dotyka trwałego powiadomienia, użytkownik wraca z Android Auto, użytkownik wraca z innej aplikacji. Każde z nich może wyzwolić odtworzenie UI z innym stanem back stacku.

W MAUI rozwiązanie wymaga współdzielonej usługi stanu (w tym projekcie `RadioStateService`), która działa jako jedyne źródło prawdy. Serwis działający w tle zapisuje do niej, UI czyta z niej. Połączenie między nimi musi przetrwać odtworzenie UI bez wyciekania pamięci lub tworzenia duplikatów subskrypcji. Oznacza to staranne zarządzanie subskrypcjami zdarzeń — subskrybowanie gdy strona się pojawia, odsubskrybowywanie gdy znika — i zapewnienie, że sama usługa stanu jest singletonem, który przeżywa każdą indywidualną stronę.

**Dlaczego to zajęło dużo czasu**

Interakcje między zdarzeniami AudioFocus, logiką reconnectu, zatrzymaniami zainicjowanymi przez użytkownika i cyklem życia UI to macierz przypadków brzegowych. Każda kombinacja musi działać poprawnie:

- Użytkownik zatrzymuje → nawigacja mówi → przychodzi AudioFocus gain → aplikacja nie może wznowić
- Strumień pada → zaczyna się reconnect → przychodzi połączenie telefoniczne → reconnect musi się zatrzymać → rozmowa się kończy → reconnect wznawia
- Użytkownik pauzuje → przełącza do AA → AA pokazuje stan pauzy → użytkownik wraca do telefonu → UI telefonu pokazuje stan pauzy
- Aplikacja jest w tle → system zabija UI → użytkownik dotyka powiadomienia → UI odtwarza się → pokazuje poprawny stan natychmiast

Żadne z tych nie jest obsługiwane przez framework. Każde to celowa decyzja w kodzie.

---

### 7. Album Art AAOS — Bitmap działa na BT i AA, ignorowane na Automotive

**Objaw**

Aplikacja poprawnie pokazuje domyślną ikonę okładki albumu na urządzeniach Bluetooth (samochodowe head unity, głośniki, słuchawki) i na Android Auto. Ta sama ikona jest całkowicie nieobecna na Android Automotive OS — karta mediów pokazuje puste/zastępcze zdjęcie zamiast ikony aplikacji. Brak crashu, brak błędu w logach. Ikona po prostu nie jest wyświetlana.

**Przyczyna źródłowa**

Bluetooth i Android Auto odczytują okładkę albumu z `MediaMetadataCompat` używając pól **Bitmap** — `MetadataKeyAlbumArt` i `MetadataKeyDisplayIcon`. Ustawiasz obiekt `Bitmap` przez `PutBitmap()`, a zarówno BT jak i AA renderuje go poprawnie. To jest wzorzec pokazywany w każdym przykładzie MediaSession online.

AAOS całkowicie ignoruje pola Bitmap. UI mediów AAOS działa w osobnym procesie systemowym (`com.android.car.media`) i rozwiązuje okładki albumu wyłącznie przez pola **URI** — `MetadataKeyAlbumArtUri`, `MetadataKeyArtUri`, `MetadataKeyDisplayIconUri`. Jeśli URI nie jest ustawione, AAOS nie pokazuje niczego, niezależnie od tego ile pól Bitmap populujesz.

Nie jest to udokumentowane w jednym jasnym miejscu. Dokumentacja deweloperów Androida wspomina metadane oparte na URI jako alternatywę, ale nie stwierdza, że AAOS tego wymaga. Jeśli przenosisz działającą aplikację AA/BT do Automotive i okładka albumu znika, to prawie na pewno jest powód.

**Zły wzorzec — działa na BT i AA, zawodzi na AAOS**

```csharp
// ❌ Tylko Bitmap — BT i AA wyświetlają, AAOS ignoruje
var bitmap = BitmapFactory.DecodeResource(Resources, Resource.Drawable.radio1);
var metadata = new MediaMetadataCompat.Builder()
    .PutString(MediaMetadataCompat.MetadataKeyTitle, stationName)
    .PutString(MediaMetadataCompat.MetadataKeyArtist, artist)
    .PutBitmap(MediaMetadataCompat.MetadataKeyAlbumArt, bitmap)
    .Build();
_mediaSession.SetMetadata(metadata);
```

**Poprawny wzorzec — działa na BT, AA i AAOS**

Ustaw zarówno Bitmap (dla BT/AA) jak i URI (dla AAOS). URI musi używać schematu `android.resource://` w formacie **typ/nazwa**, a nie formatu ID zasobu liczbowego.

```csharp
// ✅ Bitmap + URI — pokrywa wszystkie trzy platformy
var bitmap = BitmapFactory.DecodeResource(Resources, Resource.Drawable.radio1);
var artUri = $"android.resource://{PackageName}/drawable/radio1";

var metadata = new MediaMetadataCompat.Builder()
    .PutString(MediaMetadataCompat.MetadataKeyTitle, stationName)
    .PutString(MediaMetadataCompat.MetadataKeyArtist, artist)
    // Bitmap — dla Bluetooth i Android Auto
    .PutBitmap(MediaMetadataCompat.MetadataKeyAlbumArt, bitmap)
    .PutBitmap(MediaMetadataCompat.MetadataKeyDisplayIcon, bitmap)
    // URI — dla AAOS (rozwiązuje cross-process przez ContentResolver)
    .PutString(MediaMetadataCompat.MetadataKeyAlbumArtUri, artUri)
    .PutString(MediaMetadataCompat.MetadataKeyArtUri, artUri)
    .PutString(MediaMetadataCompat.MetadataKeyDisplayIconUri, artUri)
    .Build();
_mediaSession.SetMetadata(metadata);
```

**Format URI ma znaczenie**

Istnieją dwa formaty URI `android.resource://`:

| Format | Przykład | AAOS |
|---|---|---|
| ID zasobu liczbowego | `android.resource://com.myapp/2131230856` | ❌ Niektóre buildy AAOS nie mogą tego rozwiązać |
| Typ/nazwa | `android.resource://com.myapp/drawable/radio1` | ✅ Działa niezawodnie na wszystkich buildach AAOS |

Zawsze używaj formatu `typ/nazwa`. Format liczbowy jest technicznie poprawny, ale zaobserwowano jego niepowodzenie na pewnych buildach emulatora AAOS i prawdziwych samochodowych head unitach.

**Drzewo przeglądania i kolejka — również potrzebują URI**

Poprawka metadanych MediaSession pokrywa ekran "teraz odtwarzane". Ale AAOS wyświetla również ikony stacji w **drzewie przeglądania** (z `OnLoadChildren`) i w **kolejce**. Są to oddzielne obiekty `MediaDescriptionCompat` i muszą również zawierać URI ikony:

```csharp
// Elementy drzewa przeglądania (OnLoadChildren → CreateStation)
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

// Elementy kolejki (BuildQueueItems)
var iconAndroidUri = Android.Net.Uri.Parse(
    $"android.resource://{PackageName}/drawable/radio1");
var desc = new MediaDescriptionCompat.Builder()
    .SetMediaId(mediaId)
    .SetTitle(stationName)
    .SetMediaUri(Android.Net.Uri.Parse(streamUrl))
    .SetIconUri(iconAndroidUri)
    .Build();
```

**Duża ikona powiadomienia**

Niektóre implementacje AAOS wracają również do dużej ikony powiadomienia, gdy metadane MediaSession nie mają rozwiązywalnej grafiki. Dodanie `SetLargeIcon(bitmap)` do `Notification.Builder` zapewnia dodatkową siatkę bezpieczeństwa:

```csharp
var builder = new Notification.Builder(this, channelId)
    .SetContentTitle(title)
    .SetSmallIcon(Resource.Mipmap.appicon)
    .SetLargeIcon(bitmap)  // ← fallback AAOS
    .SetStyle(new Notification.MediaStyle()
        .SetMediaSession(sessionToken));
```

**Podsumowanie — pełna lista kontrolna ikon AAOS**

| Gdzie | Co ustawić | Dlaczego |
|---|---|---|
| `MediaMetadataCompat` (teraz odtwarzane) | `PutBitmap` + `PutString` dla wszystkich trzech kluczy URI | BT/AA używają Bitmap, AAOS używa URI |
| Elementy `OnLoadChildren` (drzewo przeglądania) | `MetadataKeyAlbumArtUri` + `MetadataKeyDisplayIconUri` | Ikony listy stacji AAOS |
| Elementy kolejki | `SetIconUri()` na `MediaDescriptionCompat` | Widok kolejki AAOS |
| Powiadomienie | `SetLargeIcon(bitmap)` | Fallback dla buildów AAOS sprawdzających grafikę powiadomień |
| Format URI | `android.resource://pakiet/drawable/nazwa` (typ/nazwa) | Niezawodne rozwiązywanie cross-process |

> **Jeśli przenosisz z Android Auto do AAOS:** Najczęstszy błąd to zakładanie, że jeśli okładka albumu działa na AA, zadziała na AAOS. Nie zadziała. AA odczytuje Bitmap, AAOS odczytuje URI. Musisz ustawić oba. Dotyczy to każdego `MediaMetadataCompat` i każdego `MediaDescriptionCompat` w twoim drzewie przeglądania, kolejce i metadanych teraz-odtwarzanego.

---

### 8. Dystrybucja Google Play AAOS — dlaczego APK działa, ale sklep odrzuca aplikację

**Sytuacja**

Aplikacja działa poprawnie na emulatorze AAOS. Ręcznie załadowany APK działa na prawdziwym samochodowym head unicie. Jednak Google Play Console odrzuca zgłoszenie — raport pre-launch albo nie przechodzi przeglądu automotive, albo aplikacja jest blokowana ze ścieżki AAOS, albo sklep nigdy jej nie eksponuje na urządzeniach automotive. Brak crashu, brak błędu w czasie wykonania. Wszystko funkcjonalne. Tylko zablokowany wpis sklepowy.

To jest powszechne doświadczenie deweloperów przenoszących aplikacje .NET MAUI do AAOS. Powodem jest to, że **Google Play ma oddzielną i ścisłą warstwę wymagań dla dystrybucji AAOS**, która jest całkowicie niezależna od tego, czy aplikacja działa w czasie wykonania. APK/AAB jest walidowany względem listy kontrolnej metadanych, deklaracji manifestu i wymagań strukturalnych zanim zostanie kiedykolwiek zainstalowany lub przetestowany na prawdziwym urządzeniu. Jeśli jakikolwiek element brakuje, zgłoszenie jest odrzucane cicho lub aplikacja po prostu nie pojawia się na ścieżce automotive.

Ta sekcja dokumentuje każde znane wymaganie, które musi być spełnione, aby aplikacja multimedialna .NET MAUI przeszła przegląd AAOS Google Play.

---

#### Wymaganie 1: `automotive_app_desc.xml` — obowiązkowy deskryptor automotive

Google Play wymaga pliku XML deskryptora, który jawnie deklaruje aplikację jako aplikację medialną automotive. Bez tego pliku aplikacja nie zostanie zatwierdzona do ścieżki automotive, niezależnie od tego jak dobrze działa.

Utwórz `Platforms/Android/Resources/xml/automotive_app_desc.xml`:

```xml
<automotiveApp>
    <uses name="media" />
</automotiveApp>
```

W .NET MAUI ten plik musi być umieszczony w `Platforms/Android/Resources/xml/`. System kompilacji spakuje go jako `res/xml/automotive_app_desc.xml` w APK/AAB. Zweryfikuj jego obecność w wyjściowym APK rozpakowując go za pomocą `apktool` lub sprawdzając AAB za pomocą `bundletool`.

---

#### Wymaganie 2: `AndroidManifest.xml` — pełny zestaw deklaracji automotive

Działający manifest dla AA wyłącznie na telefon nie jest wystarczający dla dystrybucji AAOS Play. Poniższe dodatki są wszystkie wymagane:

**a) `<meta-data>` linkujące do deskryptora automotive**

Wewnątrz elementu `<application>`:

```xml
<meta-data
    android:name="com.google.android.gms.car.application"
    android:resource="@xml/automotive_app_desc" />
```

To jest punkt wejścia, którego Google Play używa do identyfikacji i walidacji deskryptora automotive. Jeśli ten `<meta-data>` brakuje, sklep traktuje aplikację jako nie-automotive niezależnie od innych deklaracji.

**b) `<uses-feature>` dla typu sprzętu automotive**

```xml
<uses-feature
    android:name="android.hardware.type.automotive"
    android:required="false" />
```

`required="false"` jest obowiązkowe, jeśli ten sam APK/AAB celuje zarówno w telefony jak i samochody. Ustawienie `required="true"` ogranicza aplikację wyłącznie do urządzeń automotive — co jest celowe tylko jeśli publikujesz oddzielny build wyłącznie automotive. Dla uniwersalnego builda, zawsze używaj `false`.

**c) Filtr intent `MediaBrowserService` — poprawna forma**

Deklaracja serwisu musi zawierać akcję `android.media.browse.MediaBrowserService`. To jest to, czego framework mediów AAOS używa do odkrycia twojego serwisu. Serwis, który ma tylko filtr intent AA, będzie znaleziony przez Android Auto, ale cicho ignorowany przez AAOS.

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

Atrybut `android:permission="android.permission.BIND_MEDIA_BROWSER_SERVICE"` jest wymagany — zapewnia, że tylko system i autoryzowani wywołujący mogą bindować do twojego serwisu. Bez niego, systemowy framework mediów AAOS może odmówić bindowania.

**d) Kompletny przykład manifestu ze wszystkimi dodatkami automotive**

```xml
<manifest ...>

    <uses-feature
        android:name="android.hardware.type.automotive"
        android:required="false" />

    <application ...>

        <!-- Link do deskryptora automotive — wymagany przez Google Play -->
        <meta-data
            android:name="com.google.android.gms.car.application"
            android:resource="@xml/automotive_app_desc" />

        <!-- MediaBrowserService — wymagany dla AAOS + Android Auto -->
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

#### Wymaganie 3: AAB (Android App Bundle) — nie APK

Google Play wymaga formatu AAB dla nowych zgłoszeń od sierpnia 2021. Ręcznie ładowane APK to pomijają — dlatego APK działa, ale zgłoszenie do Play zawodzi.

W Visual Studio / .NET MAUI, publikuj jako AAB:

```
dotnet publish -f net10.0-android -c Release /p:AndroidPackageFormat=aab
```

Lub ustaw w `.csproj`:

```xml
<PropertyGroup Condition="'$(Configuration)' == 'Release'">
    <AndroidPackageFormat>aab</AndroidPackageFormat>
</PropertyGroup>
```

Zweryfikuj, że AAB zawiera zasoby automotive, sprawdzając go za pomocą `bundletool`:

```bash
bundletool dump resources --bundle=app.aab --resource=xml/automotive_app_desc
```

---

#### Wymaganie 4: `targetSdkVersion` i `minSdkVersion`

Dla dystrybucji AAOS, Google Play wymusza:

- `targetSdkVersion` musi być niedawny — obecnie wymagane jest 33 lub wyższe dla nowych zgłoszeń (Google podnosi to corocznie; sprawdź Play Console w celu uzyskania aktualnego wymagania)
- `minSdkVersion` dla AAOS: minimalny poziom API dla AAOS to **23** (Android 6.0), ale praktyczne urządzenia AAOS zaczynają się od **API 28** (Android 9). Ustawienie `minSdkVersion="28"` pokrywa cały rzeczywisty sprzęt AAOS, jednocześnie utrzymując możliwość instalacji aplikacji na telefonach z Androidem 9+.

W `.csproj`:

```xml
<PropertyGroup>
    <ApplicationId>com.yourpackage.radioandroid</ApplicationId>
    <SupportedOSPlatformVersion>28</SupportedOSPlatformVersion>
    <TargetSdkVersion>35</TargetSdkVersion>
</PropertyGroup>
```

---

#### Wymaganie 5: `onGetRoot()` musi obsługiwać wywołujących AAOS

Robot pre-launch Google Play łączy się z `MediaBrowserService` programowo i wywołuje `onGetRoot()`. Jeśli twoja implementacja odmawia nieznanym nazwom pakietów lub zwraca `null` dla pakietów systemowych AAOS, automatyczny przegląd zawodzi.

Framework mediów AAOS łączy się z pakietu `com.android.car.media`. Twój `OnGetRoot()` musi go zezwolić:

```csharp
public override BrowserRoot OnGetRoot(string clientPackageName, int clientUid, Bundle rootHints)
{
    // Zezwól frameworkowi mediów AAOS i Android Auto
    // Nie stosuj whitelist znanych pakietów — robot przeglądu używa własnej nazwy pakietu
    return new BrowserRoot(MediaRoot, null);
}
```

Jeśli masz whitelist pakietów (zezwól tylko własnej aplikacji, hostowi Google AA itp.), automatyczny przegląd pre-launch zostanie odrzucony, ponieważ nazwa pakietu test runnera nie jest na twojej liście. Albo usuń whitelist całkowicie, albo dodaj fallback, który zwraca poprawny root dla nieznanych wywołujących zamiast zwracać `null`.

---

#### Wymaganie 6: `OnLoadChildren()` musi zwracać wyniki synchronicznie (lub sygnalizować zakończenie)

Robot przeglądu Play wywołuje `OnLoadChildren()` i oczekuje wyniku w limicie czasu. Jeśli twoja implementacja odracza wynik i nigdy nie wywołuje `result.SendResult()` (lub wywołuje to zbyt późno), przegląd kończy się timeoutem i zgłoszenie zawodzi.

Zawsze wywołuj `result.SendResult()` na każdej ścieżce kodu w `OnLoadChildren()`:

```csharp
public override void OnLoadChildren(string parentId, Result result)
{
    var items = BuildStationList(); // preferowane synchronicznie
    result.SendResult(new JavaList<MediaBrowserCompat.MediaItem>(items));
}
```

Jeśli odraczasz z `result.Detach()` dla asynchronicznego ładowania, musisz wywołać `result.SendResult()` nawet na ścieżkach błędów — wynik `null` sygnalizuje "brak elementów" czysto; nigdy nie zostawiaj wyniku niewysłanego.

---

#### Wymaganie 7: Oddzielna ścieżka AAOS w Play Console (opcjonalne, ale zalecane)

Google Play Console obsługuje dedykowaną ścieżkę **Automotive OS** oddzielną od ścieżki telefon. Publikowanie na tej ścieżce pozwala zespołowi Google przetestować przepływy specyficzne dla automotive bez wpływu na wydanie telefoniczne. Dla aplikacji medialnej odblokuje to również raport pre-launch specyficzny dla AAOS, który pokazuje szczegółowe wyniki z emulatora AAOS.

Aby celować w tę ścieżkę, AAB musi mieć zadeklarowane `android.hardware.type.automotive` (Wymaganie 2b) i deskryptor automotive (Wymaganie 1). Jeden uniwersalny AAB może pokryć obie ścieżki — ten sam plik binarny jest dystrybuowany na telefony i samochody.

---

#### Dlaczego to jest trudniejsze w .NET MAUI niż w Kotlinie

W natywnym projekcie Kotlin/Gradle, szablon "Automotive" Android Studio dodaje wszystko powyższe automatycznie: XML deskryptora, wpisy manifestu, poprawną deklarację serwisu, `targetSdkVersion` — wszystko wstępnie skonfigurowane i walidowane przez IDE. Android Studio ostrzega cię w czasie kompilacji, jeśli cokolwiek brakuje.

W .NET MAUI nic z tego nie jest zautomatyzowane. Narzędzia MAUI nic nie wiedzą o automotive. Każdy wpis manifestu, każdy zasób XML, każda flaga pakowania to odpowiedzialność dewelopera. Nie ma szablonu "automotive", żadnego ostrzeżenia lint dla brakującego deskryptora, żadnej walidacji IDE. Pierwszą oznaką, że coś brakuje, jest odrzucenie przez Play Console — po uploadu, przejściu podpisywania i wyrównania oraz oczekiwaniu w kolejce ręcznego przeglądu.

Wymagania wymienione w tej sekcji zostały odkryte przez ten proces — nie przez dokumentację, ale przez odrzucenia.

---

#### Lista kontrolna dystrybucji AAOS

| # | Wymaganie | Plik / Lokalizacja | Typowy błąd |
|---|---|---|---|
| 1 | `automotive_app_desc.xml` istnieje | `Platforms/Android/Resources/xml/` | Całkowicie brakujący — nie generowany przez narzędzia MAUI |
| 2a | `<meta-data com.google.android.gms.car.application>` | `AndroidManifest.xml` → `<application>` | Brakujący `<meta-data>` nawet gdy XML istnieje |
| 2b | `<uses-feature android.hardware.type.automotive required="false">` | `AndroidManifest.xml` | `required="true"` blokuje instalację na telefonie |
| 2c | `MediaBrowserService` ma uprawnienie `BIND_MEDIA_BROWSER_SERVICE` | `AndroidManifest.xml` → `<service>` | Pominięte uprawnienie — AAOS odmawia bindowania |
| 3 | Opublikowane jako AAB, nie APK | `.csproj` / komenda publish | APK działa lokalnie, AAB wymagane dla Play |
| 4 | `targetSdkVersion` ≥ 33 | `.csproj` | Przestarzały docelowy SDK blokuje zgłoszenie |
| 5 | `OnGetRoot()` zwraca poprawny root dla każdego wywołującego | `AudioPlaybackService.cs` | Whitelist pakietów blokuje robota przeglądu |
| 6 | `OnLoadChildren()` zawsze wywołuje `SendResult()` | `AudioPlaybackService.cs` | Odroczony wynik kończy się timeoutem w przeglądzie |
| 7 | Ścieżka Automotive utworzona w Play Console | Google Play Console | Aplikacja opublikowana tylko na ścieżkę telefoniczną |

---

### 9. Android Automotive OS — dlaczego port został porzucony (polityka treści Automotive)

Spełnienie wszystkich wymagań technicznych udokumentowanych w sekcji 8 powyżej — plik deskryptora, deklaracje manifestu, poprawne bindowanie `MediaBrowserService`, format AAB, album art oparty na URI — jest konieczne, ale nie wystarczające do przejścia certyfikacji AAOS Google Play.

**Blokującym ograniczeniem nie jest wymóg techniczny. Jest to wymóg polityki UI specyficzny dla Automotive OS.**

#### Dlaczego Android Auto przechodzi, ale AAOS nie

Aplikacja jest dostarczana z **czterema wbudowanymi stacjami startowymi**, które są zawsze obecne przy nowej instalacji. To wystarczy dla certyfikacji Android Auto — drzewo treści przeglądania nie jest puste, robot przeglądu znajduje stacje w `OnLoadChildren`, a przegląd AA przechodzi.

Android Auto działa również w zasadniczo innym modelu: aplikacja medialna działa na **telefonie użytkownika**, a head unit jest klientem wyświetlania. Zarządzanie treścią — dodawanie stacji, edytowanie URL-i — odbywa się na ekranie telefonu, poza trybem jazdy. Polityka AA na to pozwala, ponieważ interakcja odbywa się na urządzeniu towarzyszącym, a nie na wyświetlaczu samochodu.

Android Automotive OS jest inny. AAOS to **samodzielny system** wbudowany w samochód — nie ma telefonu towarzyszącego. Każda interakcja użytkownika odbywa się na ekranie samochodu i każda akcja podlega zatem ograniczeniom UI Automotive, które obowiązują podczas jazdy pojazdu.

#### Blokująca polityka UI AAOS

Wytyczne UI Automotive Google zabraniają, gdy pojazd jest w ruchu:

- **Wprowadzania tekstu jakiegokolwiek rodzaju** — brak klawiatur, pól URL, pól wyszukiwania
- **Złożonych przepływów nawigacyjnych** — żadnej akcji wymagającej więcej niż dwóch dotknięć do dotarcia
- **Akcji konfiguracji lub ustawień** — brak przepływów wymagających od użytkownika dostarczenia danych

Dodawanie stacji w RadioAndroid wymaga wpisania nazwy stacji i URL strumienia. To jest centralna akcja użytkownika, wokół której zbudowana jest aplikacja. Na AAOS ta akcja jest kategorycznie zakazana przez politykę. Nie ma zgodnego sposobu implementacji jej na ekranie samochodu.

#### Dlaczego cztery stacje startowe tego nie rozwiązują

Cztery domyślne stacje spełniają wymaganie "treść obecna przy instalacji" i wystarczą do przejścia przeglądu AA. Nie spełniają wymagania AAOS, ponieważ:

- Recenzenci certyfikacji AAOS oceniają czy podstawowa funkcjonalność aplikacji jest dostępna na ekranie samochodu w sposób zgodny z polityką — nie tylko czy coś się odtwarza
- Użytkownik, który chce słuchać jakiejkolwiek stacji poza tymi czterema domyślnymi, nie ma zgodnej ścieżki do dodania jej na AAOS
- Propozycja wartości aplikacji — *odtwarzaj dowolny strumień radia internetowego, który wybierzesz* — jest nie do pogodzenia z polityką zakazującą akcji wejścia potrzebnych do wybrania strumienia

**Wniosek: port do Android Automotive OS został porzucony.**

Aplikacja działa poprawnie na AAOS na poziomie technicznym — odtwarzanie, sesja mediów, drzewo przeglądania, album art, powiadomienia — wszystko działa. Ręcznie załadowany APK działa na prawdziwym samochodowym head unicie bez problemów. Ale aplikacja nie może być opublikowana na ścieżce Automotive Google Play, ponieważ polityka treści Automotive Android sprawia, że centralna funkcja aplikacji — dodawanie stacji zdefiniowanych przez użytkownika — jest niemożliwa do zaimplementowania w sposób zgodny z polityką na ekranie samochodu.

| Wymaganie | Android Auto | Android Automotive OS |
|---|---|---|
| Przeglądalna treść obecna przy instalacji | ✅ Cztery stacje startowe | ✅ Cztery stacje startowe |
| Zarządzanie treścią (dodawanie stacji) | ✅ Na ekranie telefonu — poza trybem jazdy | ❌ Musi się dziać na ekranie samochodu — wejście tekstowe zabronione |
| Użytkownik może uzyskać dostęp do dowolnego strumienia | ✅ Dodaj stacje na telefonie, odtwarzaj w samochodzie | ❌ Brak zgodnego sposobu dodawania stacji na ekranie AAOS |
| Wynik certyfikacji | ✅ Przeszedł przegląd Google Play AA | ❌ Port porzucony — niezgodność polityki |

Praca techniczna specyficzna dla AAOS udokumentowana w sekcjach 7 i 8 tego README — obsługa URI Album Art, deskryptor automotive, implementacja `OnGetRoot()` i `OnLoadChildren()` — pozostaje w bazie kodu i działa poprawnie. Blokadą nie jest kod. Jest polityką.

---

## 🏗 Architektura

### Warstwy systemu

```
┌──────────────────────────────────────────────────────────────┐
│                     Warstwa UI                              │
│  - RadioPage.xaml, StationPage.xaml                          │
│  - EditStacjaPage.xaml, EditStationPage.xaml                  │
│  - Interakcja użytkownika: Play, Stop, Następna, Poprzednia, │
│    wybór stacji                                              │
└───────────────▲──────────────────────────────────────────────┘
                │
                │  (polecenia użytkownika)
                ▼
┌──────────────────────────────────────────────────────────────┐
│             Logika aplikacji / Warstwa MVVM                 │
│  - RadioStateService.cs, StationService.cs, SettingsService │
│  - Przechowuje stan odtwarzania, playlistę, ustawienia      │
└───────────────▲──────────────────────────────────────────────┘
                │
                │  (zmiany stanu, powiadomienia)
                ▼
┌──────────────────────────────────────────────────────────────┐
│              Warstwa serwisu odtwarzania                    │
│  - AudioPlaybackService.cs (+ klasy częściowe)              │
│  - Odpowiada za:                                            │
│    • Odtwarzanie (LibVLC)                                   │
│    • Foreground Service (Android)                           │
│    • Android Auto, BT, powiadomienia                        │
│    • Watchdog, reconnect, komórkowy fallback                │
└───────────────▲──────────────────────────────────────────────┘
                │
                │  (polecenia odtwarzania)
                ▼
┌──────────────────────────────────────────────────────────────┐
│                  Warstwa silnika LibVLC                     │
│  - LibVLCSharp, VideoLAN.LibVLC.Android                     │
│  - Natywny streaming audio, buforowanie, dekodowanie        │
└──────────────────────────────────────────────────────────────┘
```

### Mechanizmy stabilności i ochrony

| Mechanizm | Przed czym chroni |
|---|---|
| **Watchdog** | Ciche zawieszenia VLC — wykrywa brak aktywności audio, wyzwala reset |
| **Pętla Reconnectu** | Utrata sieci — ponawia próby odtwarzania z wykładniczym backoffem |
| **Komórkowy Fallback** | Martwy uplink Wi-Fi — binduje do danych mobilnych, wraca gdy Wi-Fi odzyska łączność |
| **Bezpieczne Wątkowanie** | Natywne deadlocki — callbacki VLC wyzwalające metody VLC przekazywane do ThreadPool |
| **Bezpieczeństwo Pamięci Natywnej** | Crashe SIGSEGV — polling i referencje Media anulowane przed zwolnieniem pamięci natywnej |
| **Ochrona Foreground Service** | ANR na Androidzie 12 — natychmiastowe `StartForeground` przy każdym `OnStartCommand` |
| **Synchronizacja Stanu MVVM** | Ghost stan UI — UI zawsze odzwierciedla rzeczywisty stan odtwarzania |

### Struktura plików

```
RadioAndroid/
├── RadioAndroid/
│   ├── App.xaml                — Definicja aplikacji MAUI
│   ├── App.xaml.cs             — Logika startowa aplikacji
│   ├── MainPage.xaml           — Główna powłoka/strona
│   ├── MainPage.xaml.cs        — Logika głównej strony
│   ├── Views/
│   │   ├── RadioPage.xaml          — Główny UI odtwarzacza
│   │   ├── RadioPage.xaml.cs       — Logika głównego odtwarzacza
│   │   ├── StationPage.xaml        — Lista stacji (widok listy + kafelków)
│   │   ├── StationPage.xaml.cs     — Logika listy stacji
│   │   ├── EditStacjaPage.xaml     — Formularz edycji pojedynczej stacji (nazwa + URL)
│   │   ├── EditStacjaPage.xaml.cs  — Logika edycji pojedynczej stacji (Zapisz / Usuń)
│   │   ├── EditStationPage.xaml    — Zapis/ładowanie playlisty (JSON + PLS) + 9-pasmowy EQ
│   │   ├── EditStationPage.xaml.cs — Logika playlisty i EQ
│   │   ├── HelpPage.xaml           — Przewodnik użytkownika
│   │   └── HelpPage.xaml.cs        — Logika przewodnika użytkownika
│   ├── Services/
│   │   ├── RadioStateService.cs    — Współdzielony stan odtwarzania (MVVM)
│   │   ├── StationService.cs       — Logika wyboru stacji
│   │   └── SettingsService.cs      — Persystowane ustawienia użytkownika
│   └── Models/
│       ├── Station.cs              — Model stacji (nazwa + URL)
│       └── StacjaViewModel.cs      — ViewModel stacji (MVVM)
├── Platforms/Android/
│   ├── AudioPlaybackService.cs           — Główny serwis (klasa częściowa)
│   ├── AudioPlaybackService.Playback.cs  — Play/Stop/Pauza/HardReset, korektor
│   ├── AudioPlaybackService.Media.cs     — Zdarzenia VLC, powiadomienia, metadane
│   ├── AudioPlaybackService.Reconnect.cs — Pętla reconnectu, łączność, komórkowe
│   ├── AudioPlaybackService.Queue.cs     — Zarządzanie kolejką Następna/Poprzednia
│   ├── AudioPlaybackService.Callbacks.cs — MediaSession + AudioFocus
│   ├── AudioPlaybackService.Cellular.cs  — Komórkowy fallback, monitor odzysku Wi-Fi
│   ├── AudioPlaybackService.Watchdog.cs  — Timer watchdog, śledzenie aktywności VLC
│   └── AndroidManifest.xml               — Manifest aplikacji Android (uprawnienia, funkcje)
└── RadioAndroid.csproj                   — Plik projektu .NET MAUI (zależności, konfiguracja)
```

`AudioPlaybackService` jest `klasą częściową` (partial class) podzieloną na 8 plików według odpowiedzialności. Dzięki temu każdy plik jest skupiony i zarządzalny, jednocześnie współdzieląc stan przez instancję serwisu.

| Plik | Odpowiedzialność |
|---|---|
| `AudioPlaybackService.cs` | Cykl życia serwisu, `OnCreate`, `OnStartCommand`, `OnDestroy`, `OnLoadChildren` |
| `AudioPlaybackService.Playback.cs` | `PlayRadio`, `StopRadio`, `PauseRadio`, `HardResetVlc`, korektor |
| `AudioPlaybackService.Reconnect.cs` | Pętla reconnectu, wykładniczy backoff, zdarzenia łączności |
| `AudioPlaybackService.Media.cs` | Handlery zdarzeń VLC, polling metadanych, powiadomienia |
| `AudioPlaybackService.Queue.cs` | Kolejka stacji, Następna/Poprzednia, `PlayFromQueueIndex` |
| `AudioPlaybackService.Callbacks.cs` | `AudioFocusChangeListener`, `RadioMediaSessionCallback` |
| `AudioPlaybackService.Cellular.cs` | Komórkowy fallback, monitor odzysku Wi-Fi, sonda HTTP |
| `AudioPlaybackService.Watchdog.cs` | Timer watchdog, śledzenie aktywności VLC |

Podział serwisu nie był tylko wyborem organizacyjnym — był odpowiedzią na prawdziwy problem. Pojedyncza duża klasa serwisu ze wszystkimi obowiązkami wymieszanymi razem sprawiała, że śledzenie cykli życia obiektów i wykrywanie wycieków pamięci było niezwykle trudne. Usługi działające w tle na Androidzie żyją długo; działają przez godziny. Każdy obiekt, który nie jest prawidłowo usuwany, każda subskrypcja zdarzenia, która nie jest odsubskrybowana, każda referencja trzymana dłużej niż konieczne — będą się kumulować. W długo działającym serwisie audio objawia się to jako stopniowy wzrost zużycia pamięci, ostatecznie powodując zabicie procesu przez system.

Oddzielenie logiki odtwarzania, logiki reconnectu, callbacków sesji mediów, zarządzania kolejką, komórkowego fallbacku, watchdoga i obsługi powiadomień do odrębnych plików umożliwiło rozumowanie o każdej warstwie niezależnie — co posiada, do czego jest subskrybowana i co musi wyczyścić gdy stan się zmienia. Wycieki pamięci w tej bazie kodu zostały znalezione i naprawione właśnie dlatego, że separacja uczyniła je widocznymi.

---

### AndroidManifest.xml — przegląd uprawnień

| Uprawnienie | Cel | Wymagane dla |
|---|---|---|
| `android.permission.INTERNET` | Zezwala aplikacji na dostęp do internetu dla streamowania radia. | Cała funkcjonalność streamowania |
| `android.permission.ACCESS_NETWORK_STATE` | Zezwala aplikacji na sprawdzanie łączności sieciowej (Wi-Fi, LTE, offline). | Pętla reconnectu, komórkowy fallback |
| `android.permission.WAKE_LOCK` | Utrzymuje CPU w stanie aktywności podczas odtwarzania w tle. | Zapobiega zatrzymaniu strumienia gdy urządzenie śpi |
| `android.permission.FOREGROUND_SERVICE` | Zezwala na uruchamianie usług na pierwszym planie (wymagane dla Androida 8+). | Odtwarzanie w tle, powiadomienia |
| `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Zezwala na usługę na pierwszym planie dla odtwarzania mediów (Android 14+). | Zgodność z regułami mediów Androida 14+ |
| `android.permission.POST_NOTIFICATIONS` | Zezwala na wysyłanie powiadomień (Android 13+). | Powiadomienia odtwarzania, elementy sterowania mediami |

**Uwaga:**
- Uprawnienia są żądane w manifeście i niektóre (jak POST_NOTIFICATIONS) wymagają zgody w czasie wykonania na Androidzie 13+.
- Bez tych uprawnień, aplikacja nie może streamować, odtwarzać w tle ani wyświetlać powiadomień.

---

## 🛠 Środowisko deweloperskie

Aplikacja była budowana w całości w **Visual Studio 2026** przy użyciu najnowszych frameworków Microsoft dostępnych w czasie dewelopmentu. To środowisko jest wystarczające do budowania, uruchamiania i testowania tego rodzaju aplikacji.

**Budowanie i podstawowe testowanie:**
Visual Studio 2026 z workloadem .NET MAUI pokrywa wszystko co potrzebne — budowanie, wdrażanie na fizyczne urządzenia i uruchamianie na wbudowanym emulatorze Androida dla telefonów i tabletów.

**Rozszerzone testowanie platform:**
Niektóre cele nie są dostępne w wbudowanym emulatorze Visual Studio i wymagają **Android Studio**:

- **Android Auto** — testowany za pomocą emulatora Android Auto Desktop Head Unit (DHU), dostępnego tylko przez narzędzia SDK Android Studio
- **Android Desktop / ChromeOS** — testowany za pomocą emulatora Androida dla dużych ekranów w Android Studio
- **Android Automotive OS** — testowany za pomocą emulatora AAOS (AVD Manager w Android Studio), który symuluje samochód z wbudowanym systemem Android i bez telefonu

Przetestowane fizyczne urządzenia: telefony Android, dekodery Android TV (używane jako dedykowane odtwarzacze w samochodzie), głośniki Bluetooth i samochodowe head unity.

Między Visual Studio 2026 dla dewelopmentu a Android Studio dla rozszerzonych celów emulatorów, cała macierz platform jest pokryta. Żadne inne narzędzia nie są wymagane.

---

## 📱 Wymagania

- **Android 8–16 (API 26–35)** — obsługiwany zakres
- .NET 10
- Połączenie z internetem (Wi-Fi, 4G, 5G)

## 📦 Kluczowe zależności

### Core (wszystkie platformy)

| Pakiet | Wersja | Cel |
|---|---|---|
| `Microsoft.Maui.Controls` | 10.0.50 | Framework UI .NET MAUI |
| `Microsoft.Maui.Essentials` | 10.0.50 | API platformy (Connectivity, Preferences itp.) |
| `Microsoft.Maui.Graphics` | 10.0.50 | Rysowanie i prymitywy graficzne |
| `Microsoft.Maui.Resizetizer` | 10.0.50 | SVG → generowanie ikon/ekranu powitalnego platformy |
| `Microsoft.Extensions.Logging.Debug` | 10.0.5 | Logowanie debugowania |
| `CommunityToolkit.Maui` | 14.0.1 | Rozszerzenia społeczności MAUI |
| `LibVLCSharp` | 3.9.6 | Powiązania C# dla silnika audio LibVLC |

### Tylko Android

| Pakiet | Wersja | Cel |
|---|---|---|
| `VideoLAN.LibVLC.Android` | 3.7.0-beta | Natywna biblioteka LibVLC (pliki binarne `.so` dla ARM/x86). **Beta jest celowa** — jest to jedyna wersja, która poprawnie kompiluje się względem układu pamięci nowoczesnych urządzeń Android (ARMv8/64-bit). Stabilna wersja 3.x produkuje błędy linkera na aktualnym sprzęcie. Google Play akceptuje i dystrybuuje ten build bez problemów. |
| `LibVLCSharp` | 3.9.6 | Powiązania C# dla LibVLC — jedyne opakowanie VLC używane w tym projekcie |
| `LibVLCSharp.Android.AWindowModern` | 3.9.6 | Integracja powierzchni/okna Android dla LibVLC |
| `Xamarin.AndroidX.Media` | 1.7.1.2 | `MediaBrowserServiceCompat` — wymagany dla Android Auto |
| `Xamarin.AndroidX.Lifecycle.*` | 2.10.0.2 | Musi być jawnie przypięty — patrz poniżej |
| `Xamarin.AndroidX.SavedState.SavedState.Ktx` | 1.4.0.2 | Rozszerzenia Kotlin SavedState (zależność AndroidX) |

> ⚠️ **Pinowanie wersji AndroidX.Lifecycle — wymagane do kompilacji**
>
> `Xamarin.AndroidX.Media` ma głębokie zależności przechodnie na AndroidX Lifecycle. Bez jawnych pinów wersji, NuGet wciąga sprzeczne wersje i kompilacja zawodzi z błędami takimi jak `Duplicate class kotlin.collections.jdk8.*` lub `Cannot resolve symbol 'LifecycleOwner'`.
>
> Dodaj poniższe do swojego `.csproj`:

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

## 👤 Autor

**Tomek Maslowski / tmfgroup**
2025–2026

Wesprzyj autora: [buycoffee.to/toevi](https://buycoffee.to/toevi)
🌐 [toevi.github.io/RadioAndroidPro](https://toevi.github.io/RadioAndroidPro/)

---

## 📄 Licencja

Aplikacja jest bezpłatna do użytku osobistego.

LibVLC jest używany na [licencji LGPL](https://www.videolan.org/legal.html).

Użytkownicy są odpowiedzialni za zapewnienie, że mają odpowiednie prawa dostępu do wszystkich dodawanych przez siebie strumieni.

---

*PS. Mały projekt, który zaczął się jako bezpłatne, bez reklam osobiste radio samochodowe — do mojego własnego użytku — urósł do aplikacji w Google Play dla wszystkich. Kilka osób z YouTube i moja rodzina zainspirowały mnie i pomogły mi przez najtrudniejszy moment: przejście procesu recenzji i testowania Google Play. Dziękuję wam wszystkim. Szczególne podziękowania dla głównego testera Iana Davidsona.*
