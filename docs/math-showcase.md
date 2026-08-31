# Matematyka w MerMark Editor

Dokument demonstracyjny i zestaw przykładów do sprawdzenia widoku wizualnego, zapisu Markdown, slajdów Marp oraz wydruku PDF. Wzór można edytować dwuklikiem lub klawiszem Enter po ustawieniu na nim fokusu. Enter zapisuje wzór w tekście, Ctrl+Enter zapisuje blok, Escape anuluje edycję. Przyciski 𝑥² i ∑ w pasku narzędzi wstawiają nowe wzory.

## 1. Warianty zapisu

W tekście, dolary: $E=mc^2$.

W tekście, nawiasy LaTeX: \(U=RI\).

Wariant GitHub z backtickami: $`a^2+b^2=c^2`$.

Dolary blokowe w jednej linii:

$$P=UI$$

Dolary blokowe w wielu liniach:

$$
Z=R+j\omega L
$$

Nawiasy kwadratowe LaTeX:

\[
Y=\frac{1}{Z}
\]

Blok `math`:

```math
f_0=\frac{1}{2\pi\sqrt{LC}}
```

Blok `latex` z tyldami:

~~~latex
\omega_0=2\pi f_0
~~~

Blok `tex` z czterema backtickami:

````tex
Q=\frac{\omega_0 L}{R}
````

Środowisko `equation`, bez dodatkowych dolarów:

\begin{equation}
\nabla\cdot\mathbf{D}=\rho
\end{equation}

Środowisko `align*`:

\begin{align*}
U_R &= RI \\
U_L &= j\omega LI \\
U_C &= \frac{I}{j\omega C}
\end{align*}

Środowisko `gather`:

\begin{gather}
a^2+b^2=c^2 \\
e^{j\pi}+1=0
\end{gather}

Środowisko `alignat`:

\begin{alignat}{2}
10&x+&3&y=2\\
3&x+&13&y=4
\end{alignat}

## 2. Ułamki, indeksy i symbole

Indeksy: $x_i^2+x_{i+1}^2$, pierwiastki: $\sqrt{x}+\sqrt[3]{y}$.

$$
\frac{1}{1+\frac{1}{sRC}}=\frac{sRC}{1+sRC}
$$

Litery greckie i operatory: $\alpha+\beta=\gamma$, $\Omega\neq\omega$, $a\leq b$, $x\in\mathbb{R}$.

$$
\left|\frac{U_{out}}{U_{in}}\right|=\frac{1}{\sqrt{1+(\omega RC)^2}}
$$

Akcenty i wektory: $\vec{E}$, $\hat{x}$, $\overline{z}$, $\dot{x}$, $\ddot{x}$.

## 3. Całki, sumy, granice i pochodne

$$
\int_0^{\infty}e^{-at}\,dt=\frac{1}{a},\qquad a>0
$$

$$
\sum_{n=0}^{\infty}r^n=\frac{1}{1-r},\qquad |r|<1
$$

$$
\lim_{h\to0}\frac{f(x+h)-f(x)}{h}=f'(x)
$$

$$
\frac{\partial^2 u}{\partial t^2}=c^2\nabla^2u
$$

## 4. Macierze i układy

$$
\mathbf{A}=\begin{bmatrix}R_1+R_2&-R_2\\-R_2&R_2+R_3\end{bmatrix}
$$

$$
\begin{pmatrix}I_1\\I_2\end{pmatrix}=\mathbf{A}^{-1}\begin{pmatrix}U_1\\U_2\end{pmatrix}
$$

$$
\det A=\begin{vmatrix}a&b\\c&d\end{vmatrix}=ad-bc
$$

$$
u(t)=\begin{cases}0&t<0\\1&t\geq0\end{cases}
$$

$$
\begin{aligned}
\nabla\times\mathbf{E}&=-\frac{\partial\mathbf{B}}{\partial t}\\
\nabla\times\mathbf{H}&=\mathbf{J}+\frac{\partial\mathbf{D}}{\partial t}
\end{aligned}
$$

## 5. Opisy, kolor i numer wzoru

$$
\underbrace{RI}_{\text{rezystor}}+\underbrace{L\frac{dI}{dt}}_{\text{cewka}}=U(t)\tag{1}
$$

$$
\color{teal}{P}=\color{blue}{U}\cdot\color{purple}{I}
$$

$$
\boxed{H(s)=\frac{1}{1+sRC}}
$$

Makra są lokalne dla jednego wzoru:

$$
\def\vect#1{\mathbf{#1}}\vect{E}\cdot\vect{D}
$$

## 6. Wzory w elementach dokumentu

- Rezystor: $Z_R=R$.
- Cewka: $Z_L=j\omega L$.
- Kondensator: $Z_C=\frac{1}{j\omega C}$.

> Prawo Ohma: $U=RI$.

| Wielkość | Wzór |
| --- | --- |
| Moc czynna | $P=UI\cos\varphi$ |
| Moc bierna | $Q=UI\sin\varphi$ |
| Moc pozorna | $S=UI$ |

## 7. Przykłady, które pozostają tekstem

Ceny $5 i $10 nie są wzorami. Escapowane dolary: \$x\$.

Kod inline: `$x^2$` oraz `\(x\)`.

```javascript
const literal = "$x^2$";
// $$ to również zwykły kod
```

~~~text
\[To jest przykład kodu, nie wzór\]
~~~

    $to_jest_kod$

## 8. Zakres i ograniczenia

Renderowanie obejmuje polecenia wspierane przez KaTeX, m.in. środowiska matrix, pmatrix, bmatrix, Bmatrix, vmatrix, Vmatrix, cases, aligned, gathered i array wewnątrz wzorów. Środowiska equation, align, alignat, gather (także wersje z gwiazdką) oraz CD mogą występować bez dolarów. Renderer numeruje środowiska bez gwiazdki. Dla stałych numerów pomiędzy widokami użyj `\tag{...}`; odwołania `\label`/`\ref` nie są obsługiwane. Nie jest to kompilator pełnych dokumentów LaTeX ani TikZ.

Błędne wyrażenie jest wyświetlane jako bezpieczny tekst źródłowy i pozostaje edytowalne. Polecenia ładujące zewnętrzne zasoby są zablokowane. Fonty PDF są dołączone lokalnie. DOCX zachowuje źródło LaTeX jako tekst; nie tworzy natywnych równań Worda.

W slajdach Marp alternatywne delimitery są normalizowane do zapisu dolarowego i renderowane przez silnik matematyczny Marp. Dokument Markdown zachowuje oryginalne delimitery i treść wzoru.

## Pochodzenie

Węzły edytora zaadaptowano z chinghssu/MerMarkEditorQ, commit b165dcf4fa5efbe04ac8d03adf0fc3d1f3f54393, licencja MIT. Parser, zachowanie źródła, integracja z Marp i fonty wydruku zostały dostosowane do bieżącego MerMark Editor.
