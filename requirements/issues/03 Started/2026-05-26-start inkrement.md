Lass uns mit Grundlagen anfangen, so dass ich die Anwendung schon grob bedienen kann und sie ersten Nutzen entfaltet.

# Layout

Das bisherige Layout ist grundsätzlich ok von der Aufteilung her. Aber das Anlegen von neuen Trips ist weniger wichtig als die Liste der existierenden Trips. Es muss kein Formular zum Anlegen ständig sichtbar sein; besser das wird ein Overlay bei Bedarf.

Die Farben für Trips sollen automatisch vergeben werden.

Buchungen sollen links einen Rand in der Farbe ihres Trips bekommen.

Details von Bookings sollen direkt unter dem Booking aufgeklappt werden können. Den Bereich rechts brauchen wir dafür nicht. Stattdessen kann die Spalte links etwas breiter. Der Kalender kann 2/3 des Fensters dann ausfüllen.

# Authentication

Benutzer melden sich mit Email an und bekommen ein OTP zugeschickt. Aus der Email wird ein Kürzel generiert. (Später können sie das ändern in ihrem Profil.)

OTP ist 5min gültig. Auth-Token soll 1 Monate gültig sein. Die Anwendung wird nur von einem kleinen Benutzerkreis benutzt.

# Trips

Auf der linken Seite eine schmale Spalte mit der Liste der Trips des Users. Es soll visuell unterschieden werden zwischen eigenen, dh denen, die der User angelegt hat, und denen, wozu er eingeladen wurde.

Jeder Trip zeigt sein Kürzel und seine Tripnummer. Die Tripnummer ist eine fortlaufende Zahl, die über User hinweg gezählt wird. Wenn User 1 einen Trip anlegt, bekommt er vielleicht die Nummer 031. Wenn User 2 danach einen Trip anlegt, bekommt er die Nummer 032 usw.

Die erste zu vergebene Tripnummer steht später in .env.

User können in der Liste Trips anlegen und tragen die Details in ein kleines Overlay ein:
- Kürzel
- Reisezeitraum von, bis
- Orte: besuchte Orte als Textfeld
- Auswahl der User, mit denen der Trip geteilt werden soll.

# Buchungen

Dem Buchungskalender können Buchungen hinzugefügt werden. Die müssen nicht notwendig sofort einem Trip zugeordnet sein.

Buchungen werden Dokumenten entnommen, die der User zur Verfügung stellt. Das kann auf mehrere Weisen geschehen:

- Der User gibt einen Text ein (oder fügt ihn aus dem Clipboard ein)
- Der User fügt ein Bild aus dem Clipboard ein (Screenshot einer Buchung zb in einer Email)
- Der User lädt ein PDF hoch

Es kann ein Trip ausgewählt werden, dem das Dokument bzw. die Buchungen zugeordnet werden sollen. Aber wenn es den Trip noch nicht gibt, dann geht es auch ohne.

Ebenso können User ausgewählt werden, die den Buchungen zugeordnet werden sollen. Buchungen können also direkt an User hängen ohne den Umweg um einen Trip.

Die Analyse des Dokumentes erfolgt über einen KI-Aufruf (OpenAI Modell gpt-5.4-mini). Das Ergebnis sind strukturierte Buchungsdaten, die in der Datenbank gespeichert werden.

Das Dokument wird in R2 gespeichert (das passiert in jedem Fall, auch wenn nur ein Text oder ein Screenshot angegeben wurden). Eine Referenz auf den R2 Eintrag wird in der Datenbank gespeichert mit Verweisen auf die Buchungen.

Wenn das Dokument einen Dateinamen hat, wird der in der Referenz gespeichert. Falls nicht, wird ein Platzhalter benutzt: "Texteingabe" bzw. "Screenshot".