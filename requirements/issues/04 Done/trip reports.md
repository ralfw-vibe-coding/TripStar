jetzt müssen  wir mal die reporting seite von tripstar angehen. es gibt dafür ja schon einen tab, in dem die trips nochmal angezeigt werden. das ist gut.

bei den reports gehts darum, dass trips für den steuerberater aufbereitet werden müssen. zu trips müssen trip reports eingereicht werden. die bestehen aus:

- tagessätzen
- zahlungsbelegen
  - belege, die erstattet werden müssen
  - belege, die nur gemeldet werden müssen

# Tagessätze

ein trip geht von einem startdatum bis zu einem startdatum, beispiel 1.5. bis 5.5.
für jeden tag des trips bekomme ich einen tagessatz steuerfrei erstattet ohne nachweis von belegen. der tagessatz (daily allowance) hängt davon ab, in welchem land ich den tag verbracht habe. beispiel: für jeden tag in deutschland bekomme ich 112€.

die tagessätze sind für alle länder gelistet in der csv datei "requirements/resources/daily allowances/daily_allowances_bulgaria_en.csv".
dort sind die länder mit name, kürzel und tagessatz genannt.
aber achtung: der tagessatz kann mit faktor 1 oder 2 angewandt werden. default: 2. beispiel: in der tabelle steht deutschland (GER) mit tagessatz 56€. den wende ich aber mit faktor 2 an, also werden daraus 112€ pro tag im report.

manche länder sind nicht gelistet, aber es gibt einträge für regionen, die mit mit "Other countries" beginnen. die müssen auch auswählbar sein.

## User Interface

im UI muss ich für jeden tag eines trips einen tagessatz auswählen können. dafür will ich die tage gelistet einem kalender sehen.

beispiele dafür sind hier zu sehen:

 - "requirements/resources/daily allowances/sample1.png"
 - "requirements/resources/daily allowances/sample2.png"

 je tag muss das der index des tages im trip klein zu sehen sein, sein datum, das land mit kürzel und der tagessatz. am ende steht die summe aller tagessätze.

 wenn ich einen tag auswähle, klappt die liste der länder mit ihren tagessätzen auf und ich kann dem selektierten tag das land zuweisen. beispiel: "requirements/resources/daily allowances/sample3.png"

 wenn ich neben die tage klicke, werden alle deselektiert.
 jeder tag, den ich anklicke, wird selektiert.
 wenn ich mit shift-klick klicke, dann werden die tage vom ersten bis zum angeklickten als bereich selektiert.

 wenn kein tag selektiert ist, verschwindet die auswahlliste der länder.

# Zahlungsbelege

zahlungsbelege sind dokumente, die ich hochladen muss wie buchungsbelege. manchmal ist ein buchungsbeleg auch ein zahlnugsbeleg.

in einem buchungsbeleg finden sich buchungen.

in einem zahlungsbeleg findet sich eine zahlung, d.h, darin steht ein betrag, den ich im rahmen des trips ausgegeben habe.
manchmal habe ich den betrag verauslagt und muss ihn von der firma zurückbekommen (reimbursement).
manchmal habe ich den betrag mit der firmenkreditkarte bezahlt. dann bekomme ich das geld nicht zurück, muss aber den beleg trotzdem im rahmen des trips melden.

es stellt sich die frage, wann zahlungsbelege als solche erkannt werden.
kann das bei der bisherigen dokumentenanalyse schon passieren?
es muss extrahiert werden: betrag und währung.

oder muss das in einer separaten analyse passieren?

ich muss auch die möglichkeit haben, weitere belege erst beim report zu einem trip einzureichen. das kann zunächst per upload beim trip passieren, würde ich sagen. dann wähle ich nur zahlungsbelege aus. buchungen sind in dem fall nicht darin zu erwarten.

aber schon vorhandene dokumente aus dem trip, müssen auch als zahlungsbelege zuordnbar sein.

was sind dazu deine vorschläge?

am ende will ich bei triprep je trip sehen:

- alle tage mit ihren tagessätzen und der summe
- alle zahlungsbelege mit ihren beträgen; jeder zahlungsbeleg hat auch noch ein datum und einen dateinamen und einen zweck (zb hotelbuchung). das soll ebenfalls aus dem beleg extrahiert werden wenn möglich; aber ich muss es auch verändern können.
- zahlungsbelege will ich klassifizieren als erstattungsfähig oder nicht.

und dann will ich sehen, was die summe in den jeweiligen klassen ist.
und ich will eine gesamtsumme für den ganzen trip.