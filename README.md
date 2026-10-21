Narzędzie do gry Shinobiworld.

V 0.0.1
- Uruchomiono rozszeżenie
    * Utworzono prosty popup i niezbędne skrypty.

- Dodano przycisk uruchamiający starą wersję bota:
    - Bicie chempionów, elit, bossów pod "G" (grupowo).
    - Walki PVP pod "P". Bije graczy na polu na którym stoimy,
    - Automatyczne robienie H w questach przyciskiem "V",
    - Bicie otchłani dusz pod przyciskiem "O",
    - Respienie Chempionów / Elit / Bossów wraz z ubijaniem pod przyciskiem "I",
    - Wykonywanie instancji "Upadek Ronina" wraz z rejestracją pod przyciskiem "B",
    - Wymiana kryształów ronina na kryształy chakry przyciskiem "L",
    - Podnoszenia przedmiotów do questów pod  przyciskiem "K",
    - Ulepszone wykonywanie questów H(od razu nalicza 100%),
    - Automatyczne odbieranie nagody dziennej jeśli jest dostępna,
    - Scrolowanie listy questów do wykonania,
    - Utworzenie okienka dla narzędzia,
        * Dodany przełącznik ukrywania raportów,
        * Informacja o skrótach klawiszowych.

V 0.0.2
- Dodano przełączanie między postaciami na koncie:
    - Następna postać ".",
    - Poprzednia postać ",",
- Dodano funkcje automatycznego zapisywania na turnieje,
- Stary bot uruchamia się automatycznie,
- Przenoszenie funkcji z starego bota na nowego:
    - Automatyczne odbieranie nagrody dziennej jeśli jest dostępna.

V 0.0.3
- Ustawienia bota od teraz będą zapamiętywanie w przeglądarce,
- Bot od teraz zapamiętuje listę postaci na koncie,
- W oknie bota od teraz można ustawić:
    - Automatyczne odbieranie nagród (włączone),
    - Automatyczne zapisywanie na turnieje (włączone),
    - Ukrywanie raportów (wyłączone),
- Dodano przycisk zapisywania całego konta na turnieje,
- Dodano przycisk resetowania bota (W razie problemów resetuje wszystkie ustawienia na domyślne wraz z listą postaci na koncie),



## Auto Quest (wersja eksperymentalna, EXT `dev`)

Na zakładce **Pulpit** wybierz **▶ Start Auto Quest** po wejściu na pole questa.
Przycisk zmienia się w **■ Stop Auto Quest**. Zatrzymanie anuluje
oczekiwanie na odpowiedź socketu i kończy dalsze kroki automatu. Wysłanej
już do serwera akcji nie można cofnąć.

Silnik korzysta z `q_step`, `quest_end`, `map.quests` i dostępnych
przycisków dialogu. Rozpoznaje jednoznaczne dialogi i trzy typy aktywnych
warunków `want`: **1 — Quest Kille**, **22 — Pickup Quest**, **7 — walka
questowa**. Po każdym etapie pobiera aktualny stan zadania. Nieznane typy,
kilka questów na jednym polu, kilka akcji w dialogu, brak postępu lub
brak mapy powodują zatrzymanie z komunikatem. To nie jest jeszcze
uniwersalny solver dowolnego zadania; funkcja wymaga prób w grze.

## Treningi: godzina graniczna i Mistrz Treningu II (EXT `dev`)

W **Konta → Ustawienia postaci** każda postać ma pole **Preferuj trening do godziny**,
domyślnie **Maksymalny**. Przy ustawionej godzinie (np. 18:00) automat wybiera
najdłuższy możliwy trening, który skończy się przed tą godziną (60 sekund zapasu).
Do przeliczenia służy serwerowa prędkość `tren_speed`; w razie braku tej wartości
automat nie zgaduje długości i pomija start. Godziny 01:00–23:00 dotyczą
bieżącego dnia (po upłynięciu godziny automat pomija trening),
a 00:00 oznacza następną północ.

Bonus **Mistrz Treningu I** nadal zwiększa maksymalny czas treningu z 6 do
12 jednostek. Bonus **Mistrz Treningu II** umożliwia dwa aktywne sloty:
Quick Trening, Quick ALL i Treningi całego konta uruchamiają tyle nowych
treningów, ile jest wolnych miejsc (maksymalnie dwa). Każdy nowy slot osobno
pobiera dane serwera i przechodzi wymaganą weryfikację Turnstile. Podsumowania
podają liczbę faktycznie uruchomionych treningów.

## PVE: Normal, Respiarka, Pickup, Quest Kille, Auto Quest (EXT `dev`)

- **Expiarka → Normal** jest domyślnie włączony. Wyłączenie pomija
  walki i multiwalki normalnych mobów, ale pozostawia patrol i zaznaczone
  klasy wyższe (Champion/Elita/Boss).
- **Respiarka → Zabijaj zrespione moby**: ON bije również normalne moby
  po odblokowaniu multi, nie tylko przy progu 10, i używa właściwego indeksu
  `mob_num` z `mobs[*].ranks[0]`; OFF wyłącza walki Respiarki.
- **Pickup Quest**: przechodzi kolejne pola zasobów, po niepowodzeniu
  próbuje następnego, zapamiętuje cooldown każdej sakiewki od zakończenia
  próby, czeka na pierwszą sakiewkę przed kolejnym obiegiem i wraca na
  pole questa po osiągnięciu 100%. Pętla trwa do sukcesu, STOP lub błędu.
- **Quest Kille**: odwiedza osiągalne pola pasami (od okolicy X:1 Y:1),
  a nie metodą najbliższego nieodwiedzonego pola. Rejestr portali przechowuje
  dodatkowo **mobSightings** (mob ID/nazwa, mapa, pozycja) zaobserwowane
  w poprawnych RX `a:602`. Jeśli dla konkretnego celu znamy mapę, pole
  i dostępną trasę portalami, bot przechodzi do tej mapy i po patrolu
  próbuje wrócić do punktu rozpoczęcia. Niezbadanych lokalizacji nie
  zgaduje; do pierwszego znalezienia nowego moba potrzebne są rzeczywiste
  obserwacje na danej mapie.
- **Auto Quest**: rozpoznaje H `want.type=39` przez istniejącą obsługę
  trackera i czekajkę `want.type=6` (przebieg 31 s, odświeżenie okna,
  próba przejścia z potwierdzeniem serwera). Czasy innych etapów czasowych
  mogą wymagać dopasowania do danych konkretnego questa.
- **ALL konta**: timeout potwierdzenia wyboru postaci `a:2` wrócił
  z 20 sekund do 10 sekund; pozostałe zabezpieczenia ponawiania i
  synchronizacji zostały zachowane.

## PVP — Autoataki podczas ręcznego chodzenia (EXT `dev`)

W zakładce **PVP** znajduje się przełącznik **Autoataki PvP** (domyślnie OFF).
Przy **ON** bot **nie chodzi sam**: po potwierdzonym kroku `RX a:4`
czeka na opis docelowego pola `RX a:602` i atakuje kolejno znajdujących
się na nim przeciwników z **innych wiosek**. Do ataku używa znanego
`TX a:24, char_id` oraz potwierdzenia `RX a:7` z `pvp_cd.target`.
Pomija własną postać, graczy z tej samej wioski, osoby o nieznanej
przynależności oraz cele z aktywnym cooldownem. Brak możliwości ustalenia
wioski aktywnej postaci blokuje automatyczne ataki (zamiast zgadywania).
Każdy przeciwnik jest atakowany najwyżej raz na wejście na dane pole.

`a:3.more_players` służy do szerszej listy postaci i **nie** jest używane
jako lista graczy na polu. OFF, zmiana postaci, kolejny krok i rozpoczęcie
innej automatyzacji blokują dalsze ataki ze starego pola (bieżącego,
wysłanego już żądania nie da się cofnąć). Przy odmowie serwera lub
timeoutcie nie ponawia automatycznie pojedynczego ataku.
