# CaDos uitvoeringsplan / driverkast plan — bronbestanden

`patch.py` voegt deze bestanden toe aan een app-bestand. Pas het ALTIJD toe op de versie van vóór de
eerste livegang (commit 284c6e8^), niet op de huidige live bestanden (die zijn al gepatcht):

    git show 284c6e8^:cados.html > /tmp/basis-cados.html
    python3 patch.py /tmp/basis-cados.html cados-test.html --test     # testversie
    python3 patch.py /tmp/basis-cados.html cados.html                 # live

Zelfde voor index, werf, planning, cacalc en cabon. Daarna CACHE_VERSION in sw.js verhogen.
