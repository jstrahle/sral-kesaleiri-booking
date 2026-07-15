// Reaaliaikainen paivitys ilman selaimen refreshia.
// Suunta on palvelin -> selain (SSE): selain ei kysele mitaan.
(function () {
  const total = document.getElementById('total');
  const calls = document.getElementById('calls');
  const liveHint = document.getElementById('live-hint');
  const isWall = document.body.classList.contains('wall');

  // Lista paivittyy automaattisesti vain kun se on turvallista: seinanaytto aina,
  // etusivu vain oletusnakymassa (uusin ensin, ei hakua, sivu 1). Muutoin uusi
  // rivi menisi vaaraan kohtaan, joten naytetaan vihje sen sijaan.
  const listIsLive = isWall || (calls !== null && calls.dataset.live === 'yes');

  function setTotal(value) {
    if (!total || typeof value !== 'number') return;
    const current = Number(total.dataset.total);
    if (value === current) return;

    total.dataset.total = String(value);
    total.textContent = String(value);
    total.classList.add('bump');
    setTimeout(() => total.classList.remove('bump'), 300);
  }

  function prepend(entry) {
    if (!calls) return;

    // Ei lisata samaa riviä kahdesti (esim. uudelleenlahetys).
    if (calls.querySelector('[data-id="' + entry.id + '"]')) return;

    const item = document.createElement('li');
    item.className = 'new';
    item.dataset.id = entry.id;

    const call = document.createElement('span');
    call.className = 'call';
    call.textContent = entry.callsign;
    item.appendChild(call);

    if (!isWall) {
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = new Date(entry.registered_at).toLocaleString('fi-FI', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Helsinki',
      });
      item.appendChild(time);
    }

    calls.prepend(item);

    // Pidetaan lista siistina: vanhimmat pois nakymasta.
    const limit = isWall ? 12 : 50;
    while (calls.children.length > limit) {
      calls.lastElementChild.remove();
    }
  }

  function remove(id) {
    if (!calls) return;
    const item = calls.querySelector('[data-id="' + id + '"]');
    if (item) item.remove();
  }

  let pendingUpdates = false;

  function connect() {
    const source = new EventSource('/events');

    source.addEventListener('update', (message) => {
      const data = JSON.parse(message.data);
      setTotal(data.total);

      if (listIsLive) {
        (data.added || []).forEach(prepend);
        (data.removed || []).forEach(remove);
      } else if (liveHint && ((data.added && data.added.length) || (data.removed && data.removed.length))) {
        // Hakutuloksissa tai muussa jarjestyksessa: vihje etta uusia on tullut.
        if (!pendingUpdates) {
          pendingUpdates = true;
          liveHint.hidden = false;
        }
      }
    });

    source.addEventListener('error', () => {
      // Yhteyskatkos: EventSource yrittaa itse uudelleen. Varmistetaan etta
      // laskuri korjaantuu myos pitkan katkon jalkeen.
      fetch('/api/count')
        .then((response) => response.json())
        .then((data) => setTotal(data.total))
        .catch(() => {});
    });
  }

  connect();
})();
