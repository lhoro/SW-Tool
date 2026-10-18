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
