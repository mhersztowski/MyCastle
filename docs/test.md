# PrzyłBadowy Dokument Markdown

## Spis tre\[ci

-   [NagB�wki](#nagB�wki)
    
-   [Formatowanie tekstu](#formatowanie-tekstu)
    
-   [Listy](#listy)
    
-   [Linki i obrazy](#linki-i-obrazy)
    
-   [Kod](#kod)
    
-   [Tabele](#tabele)
    
-   [Cytaty](#cytaty)
    
-   [Linie poziome](#linie-poziome)
    
-   [Listy zadaD](#listy-zadaD)
    
-   [Emoji](#emoji)
    

[test2](/test2.md)

ZwykBy link: [Google](https://google.com)

Specjalny link: Moja karta

aa11

😃→

* * *

## NagB�wki

# NagB�wek H1

## NagB�wek H2

### NagB�wek H3

#### NagB�wek H4

##### NagB�wek H5

###### NagB�wek H6

* * *

## Formatowanie tekstu

**Tekst pogrubiony** i *tekst kursywa*

***Tekst pogrubiony i kursywa***

Tekst przekre\[lony

`Kod inline`

Tekst z indeksem dolnym i indeksem g�rnym

* * *

## Listy

### Lista nienumerowana

-   Pierwszy element
    
-   Drugi element
    
-   Element zagnie|d|ony
    
-   Kolejny zagnie|d|ony
    
-   Trzeci element
    

### Lista numerowana

1.  Pierwszy element
    
2.  Drugi element
    
3.  Element zagnie|d|ony
    
4.  Kolejny zagnie|d|ony
    
5.  Trzeci element
    

### Lista z definicjami

Term 1 : Definicja terminu 1

Term 2 : Definicja terminu 2 : Druga definicja tego samego terminu

* * *

## Linki i obrazy

### Linki

[Link do Google](https://www.google.com)

[Link z tytuBem](https://www.github.com)

[Link referencyjny](https://www.stackoverflow.com)

### Obrazy

<table>
  <tr>
    <th style="width: 64px">Test</th>
    <th style="width: 255px"></th>
    <th></th>
    <th></th>
    <th></th>
    <th></th>
    <th></th>
  </tr>
  <tr>
    <td style="width: 64px"></td>
    <td style="width: 255px"></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
  <tr>
    <td style="width: 64px"></td>
    <td style="width: 255px"></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
  <tr>
    <td style="width: 64px"></td>
    <td style="width: 255px"></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
</table>

<img src="https://compote.slate.com/images/22ce4663-4205-4345-8489-bc914da1f272.jpeg" alt="" style="width: 25%; display: inline-block" /><img src="https://compote.slate.com/images/22ce4663-4205-4345-8489-bc914da1f272.jpeg" alt="" style="width: 25%; float: right" />![](https://compote.slate.com/images/22ce4663-4205-4345-8489-bc914da1f272.jpeg)

* * *

## Kod

### Kod inline

U|yj funkcji `console.log()` do wy\[wietlania danych.

### Bloki kodu

```javascript
function greet(name) {
    console.log(`Witaj, ${name}!`);
    return `Hello, ${name}`;
}

const user = "Jan";
greet(user);
```

```python
def calculate_fibonacci(n):
    if n <= 1:
        return n
    return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)

# PrzykBad u|ycia
result = calculate_fibonacci(10)
print(f"10. liczba Fibonacciego: {result}")
```

```html
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <title>PrzykBad HTML</title>
</head>
<body>
    <h1>Witaj [wiecie!</h1>
    <p>To jest przykBadowa strona HTML.</p>
</body>
</html>
```

* * *

## Tabele

| Kolumna 1 | Kolumna 2 | Kolumna 3 |
| --- | --- | --- |
| Dane 1 | Dane 2 | Dane 3 |
| Wiersz 2 | Wiersz 2 | Wiersz 2 |
| Wiersz 3 | Wiersz 3 | Wiersz 3 |

### Tabela z wyr�wnaniem

| Lewo | Zrodek | Prawo |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
| 7 | 8 | 9 |

* * *

## Cytaty

> To jest cytat blokowy. Mo|e zawiera wiele linii.
> 
> ### Cytat z nagB�wkiem
> 
> To jest cytat z nagB�wkiem i list:
> 
> 1.  Pierwszy punkt
>     
> 2.  Drugi punkt
>     
> 3.  Trzeci punkt
>     

### Zagnie|d|one cytaty

> To jest pierwszy poziom cytatu.
> 
> > To jest drugi poziom cytatu.
> > 
> > > To jest trzeci poziom cytatu.

* * *

## Linie poziome

Powy|ej jest linia pozioma.

* * *

Powy|ej jest inna linia pozioma.

* * *

Powy|ej jest trzecia linia pozioma.

* * *

## Listy zadaD

-   UkoDczone zadanie
    
-   NieukoDczone zadanie
    
-   Kolejne ukoDczone zadanie
    
-   Kolejne nieukoDczone zadanie
    

* * *

## Emoji

→

### Emoji w tek\[cie

To jest przykBad tekstu z emoji: <� **Zwietnie!** =�

* * *

## Dodatkowe elementy

### Przypisy

To jest tekst z przypisem\[^1\].

\[^1\]: To jest tre\[ przypisu.

### Klawisze

Naci\[nij Ctrl + C aby skopiowa.

### Pod\[wietlenie

==To jest pod\[wietlony tekst==

### Matematyka (LaTeX)

FormuBa inline:

FormuBa blokowa:

* * *

## PrzykBad kompleksowy

### Analiza danych

```python
import pandas as pd
import matplotlib.pyplot as plt

# Wczytanie danych
data = pd.read_csv('dane.csv')

# Podstawowe statystyki
print("Podsumowanie danych:")
print(data.describe())

# Wykres
plt.figure(figsize=(10, 6))
plt.plot(data['x'], data['y'])
plt.title('Wykres danych')
plt.xlabel('O[ X')
plt.ylabel('O[ Y')
plt.show()
```

> **Uwaga:** Ten kod wymaga zainstalowanych bibliotek `pandas` i `matplotlib`.

### Wyniki

| Metryka | Warto[ |
| --- | --- |
| Zrednia | 42.5 |
| Mediana | 40.0 |
| Odchylenie | 12.3 |

* * *

## Podsumowanie

Ten dokument zawiera wszystkie gB�wne elementy skBadni Markdown:

 **NagB�wki** - od H1 do H6  
 **Formatowanie** - pogrubienie, kursywa, przekre\[lenie  
 **Listy** - numerowane, nienumerowane, zadaD  
 **Linki i obrazy** - r�|ne formaty  
 **Kod** - inline i bloki  
 **Tabele** - podstawowe i z wyr�wnaniem  
 **Cytaty** - proste i zagnie|d|one  
 **Elementy specjalne** - emoji, klawisze, przypisy

* * *

*Dokument utworzony jako przykBad kompletnej skBadni Markdown* =�