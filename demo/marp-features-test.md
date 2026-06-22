---
marp: true
theme: gaia
paginate: true
backgroundColor: #0d1117
color: #e6edf3
---

<!-- _class: lead -->

# Marp — test funkcji

Deck do sprawdzenia trybu Marp w MerMark:
granice slajdów, dyrektywy, tła lokalne + z sieci.

---

# Zwykły slajd

- Wypunktowanie
- **Pogrubienie**, *kursywa*, `kod`
- Tabela i blok kodu niżej

| Funkcja | Status |
| ------- | ------ |
| Badge   | ✅     |
| Chipy   | ✅     |

---

<!-- _class: invert -->

# Slajd „invert"

Dyrektywa `_class: invert` → odwrócony motyw na tym slajdzie.

```ts
export const hello = (n: string) => `Cześć, ${n}!`;
```

---

![bg left:45%](assets/fable-lab.png)

# Tło lokalne

Po lewej plik z dysku (`assets/fable-lab.png`) —
inline'owany do data-URI przy Prezentuj.

---

![bg right:50%](https://placehold.co/1300x1600/11331f/d7ffe9?text=z+sieci)

# Tło z internetu

Po prawej obraz z `placehold.co` — ładuje się po sieci w podglądzie.

---

<!-- _class: lead -->

# Koniec testu

Slajdy oddzielone, dyrektywy jako chipy, mix obrazów.
