// Kavijalaskurin paivitys ilman sivun latausta - kavijat kysyvat lukua jatkuvasti.
(function () {
  const total = document.getElementById('count-total');
  const today = document.getElementById('count-today');

  async function refresh() {
    try {
      const response = await fetch('/api/counts', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json();
      if (total) total.textContent = data.total;
      if (today) today.textContent = data.today;
    } catch {
      // Verkkokatko: yritetaan uudelleen seuraavalla kierroksella.
    }
  }

  setInterval(refresh, 15000);

  // "Ei kutsua" -painike hakee seuraavan vapaan vieraskutsun (VIERAS1, VIERAS2, ...)
  const guestButton = document.getElementById('guest-button');
  const callsign = document.getElementById('callsign');

  if (guestButton && callsign) {
    guestButton.addEventListener('click', async () => {
      guestButton.disabled = true;
      try {
        const response = await fetch('/api/guest-callsign');
        if (response.ok) {
          const data = await response.json();
          callsign.value = data.callsign;
          document.getElementById('name').focus();
        }
      } finally {
        guestButton.disabled = false;
      }
    });
  }
})();
