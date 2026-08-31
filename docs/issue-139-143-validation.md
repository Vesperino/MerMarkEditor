# Matematyka i wykrywanie Codex CLI

## #139 — matematyka

Interaktywne węzły TipTap oparto na [implementacji chinghssu/MerMarkEditorQ](https://github.com/chinghssu/MerMarkEditorQ/commit/b165dcf4fa5efbe04ac8d03adf0fc3d1f3f54393), udostępnionej na licencji MIT. Nie przenoszono przebudowy eksportu na wkhtmltopdf ani pozostałych zmian forka.

Obsługiwane wejście: `$…$`, `$` z backtickami wewnątrz (wariant GitHub), `$$…$$`, `\(…\)`, `\[…\]`, bloki math/latex/tex z backtickami lub tyldami, środowiska equation/align/alignat/gather z opcjonalną gwiazdką oraz CD. Polecenia wewnątrz wzorów są ograniczone do możliwości KaTeX; nie jest to kompilator pełnego LaTeX ani TikZ.

- Edytor wizualny: renderowanie, dwuklik lub Enter do edycji, zapis i anulowanie, przyciski wstawiania wzoru inline/blokowego.
- Markdown: zachowanie delimitera i pełnego źródła; ochrona kodu, linków, HTML, escaped dolarów oraz zwykłych cen.
- Długie dokumenty: podział podglądu nie przecina wzoru w połowie.
- PDF: renderowane wzory i osadzone fonty WOFF2, bez CDN. Błędny wzór pozostaje bezpiecznym tekstem źródłowym.
- Marp: wspólna normalizacja wariantów zapisu, natywny renderer matematyki Marp.
- DOCX: zapis źródła LaTeX jako tekst, bez duplikowania warstw HTML/MathML. Natywne równania Worda nie są częścią tej zmiany.

Kompletny dokument demonstracyjny: [math-showcase.md](math-showcase.md), 46 wzorów. PDF z testu aplikacji znajduje się lokalnie w `output/pdf/math-showcase.pdf`.

## #143 — Codex CLI na Windows

Ręczny wybór pliku już istniał. Sekcja jest teraz rozwinięta przy błędzie połączenia; pozwala wybrać plik, wkleić pełną ścieżkę albo wyczyścić wybór. Przyjmowane są ścieżki otoczone cudzysłowami i zmienne Windows, np. `%LOCALAPPDATA%`.

Automatycznie przeszukiwane są:

1. PATH, z obsługą rozszerzeń exe/cmd/bat.
2. `%LOCALAPPDATA%\OpenAI\Codex\bin` i jego podkatalogi wersji.
3. `%APPDATA%\npm`.
4. `%USERPROFILE%\.local\bin`, `scoop\shims`, `.cargo\bin`, `.volta\bin`, `.bun\bin`.

Nazwy podkatalogów wersji są hashami, więc nie traktujemy ich jako numerów wersji. Kandydaci z tych podkatalogów są sprawdzani od najnowszego czasu modyfikacji. Sprawdzenie wymaga odpowiedzi `codex-cli …` na `--version`; plik launchera z WindowsApps jest odrzucany. Proces sprawdzający ma limit czasu i jest kończony po jego przekroczeniu.

„Re-check” ignoruje zapamiętaną automatyczną ścieżkę, ale respektuje wybór ręczny. Nieistniejąca ręcznie wybrana ścieżka zgłasza błąd zamiast uruchamiać inną instalację. Usunięty automatycznie zapamiętany pakiet powoduje ponowne wyszukanie podczas testu zdrowia. Zweryfikowana ścieżka jest również przekazywana przy uruchamianiu rozmowy.

Przykład ścieżki do CLI dostarczanego z aplikacją desktopową: `%LOCALAPPDATA%\OpenAI\Codex\bin\<wersja>\codex.exe`. Nie wybieraj launchera `WindowsApps\OpenAI.Codex_…\app\Codex.exe`.

## Weryfikacja

- `pnpm exec vitest run`: pełny zestaw testów frontendu.
- `cargo test --lib ai:: --manifest-path src-tauri/Cargo.toml`: testy części AI, w tym wykrywanie plików bez PATH, ręczne ścieżki i odrzucenie launchera.
- `pnpm build`: kontrola typów i produkcyjny build.
- `pnpm exec playwright test tests/e2e/math.test.ts tests/e2e/atomic-save.test.ts tests/e2e/tab-close-code-view.test.ts tests/e2e/cursor-marker-images.test.ts`: testy przeglądarkowe z emulacją IPC Tauri.

Test matematyki otwiera dokument, renderuje wszystkie przykłady, edytuje i zapisuje wzór, przełącza widoki, przeładowuje aplikację, generuje PDF offline i sprawdza slajdy Marp. Testuje też poprawianie błędnego wzoru i przyciski wstawiania. Testy konwertera przechodzą przez rzeczywisty schemat TipTap i porównują źródło po zapisie. PDF został dodatkowo wyrenderowany do obrazów stron i obejrzany.

Nie wykonywano płatnego zapytania do modelu ani nie zmieniano logowania Codex. Testy przeglądarkowe nie zastępują testu całego pakietu instalacyjnego Tauri na komputerze autora zgłoszenia.
