
const API = 'https://edcmnuriwutqxprzhkhz.supabase.co/functions/v1/movie-vault';
const $ = id => document.getElementById(id);

let movies = [], collectionKey = '', editing = null, refreshTimer;
let selectedPoster = '', selectedSource = '', searchTimer;
let searchVersion = 0, toastTimer, loadVersion = 0;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const safeUrl = value => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.href : '';
  } catch { return ''; }
};

const scoreText = number => Number(number).toFixed(1);
const formatDay = date => date
  ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  : '';

const notify = message => {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
};

const setSync = (message, online = true) => {
  $('syncStatus').innerHTML = '<i></i> ' + esc(message);
  $('syncStatus').classList.toggle('offline', !online);
};

const validKey = key => /^[A-Za-z0-9_-]{43}$/.test(key || '');

function getKey() {
  const fromLink = new URLSearchParams(location.hash.slice(1)).get('collection');
  let key = validKey(fromLink) ? fromLink : localStorage.getItem('movie-rating-key');

  if (!validKey(key)) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    key = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
  }

  localStorage.setItem('movie-rating-key', key);
  if (fromLink) history.replaceState(null, '', location.pathname + location.search);
  return key;
}

async function cloud(action, params = {}) {
  const response = await fetch(API, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, key: collectionKey, ...params}),
    cache: 'no-store'
  });

  let data;
  try { data = await response.json(); }
  catch { throw Error('The cloud server did not respond correctly'); }

  if (!response.ok) throw Error(data?.error || 'Cloud request failed');
  return data;
}

async function initialize() {
  try {
    collectionKey = getKey();
  } catch {
    setSync('Open this app over HTTPS', false);
    notify('Secure HTTPS is needed to save your movies');
    $('loading').classList.add('hidden');
    return;
  }

  await loadMovies(true);

  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && !editing) loadMovies();
  }, 15000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadMovies();
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

async function loadMovies(showLoading = false) {
  const version = ++loadVersion;
  if (showLoading) $('loading').classList.remove('hidden');

  try {
    const data = await cloud('list');
    if (version !== loadVersion) return;

    $('loading').classList.add('hidden');
    movies = data.movies || [];
    render();
    setSync('Cloud synced');
  } catch (error) {
    if (version === loadVersion) {
      setSync('Sync unavailable', false);
      notify('Could not load movies: ' + error.message);
    }
  } finally {
    if (version === loadVersion) $('loading').classList.add('hidden');
  }
}

async function copySyncLink() {
  const url = location.origin + location.pathname + '#collection=' + collectionKey;

  try {
    await navigator.clipboard.writeText(url);
    notify('Private sync link copied! Open it on your other device.');
  } catch {
    window.prompt('Copy this private sync link:', url);
  }
}

function posterMarkup(url, className, title = '') {
  const src = safeUrl(url);
  return `<div class="${className}">
    <span class="fallback-art">✦</span>
    ${src ? `<img src="${esc(src)}" alt="${esc(title)} poster" loading="lazy">` : ''}
  </div>`;
}

function render() {
  const total = movies.length;
  $('movieCount').textContent = total;
  $('totalPill').textContent = total;

  $('averageScore').textContent = total
    ? scoreText(movies.reduce((a, m) => a + Number(m.rating), 0) / total)
    : '—';

  $('topScore').textContent = total
    ? scoreText(Math.max(...movies.map(m => Number(m.rating))))
    : '—';

  const keyword = $('search').value.trim().toLowerCase();

  const list = movies.filter(m =>
    (m.title + ' ' + (m.year || '') + ' ' + (m.review || ''))
      .toLowerCase().includes(keyword)
  );

  const sort = $('sort').value;
  list.sort((a, b) => {
    if (sort === 'highest') return Number(b.rating) - Number(a.rating) || a.title.localeCompare(b.title);
    if (sort === 'lowest') return Number(a.rating) - Number(b.rating) || a.title.localeCompare(b.title);
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'year') return (b.year || 0) - (a.year || 0);
    return new Date(b.created_at) - new Date(a.created_at);
  });

  $('empty').classList.toggle('hidden', !!list.length || $('loading').offsetParent !== null);
  $('empty').querySelector('h3').textContent = keyword ? 'No matching movies' : 'No movies here yet';
  $('empty').querySelector('p').textContent = keyword
    ? 'Try a different title or search term.'
    : 'Add your first rating, and your collection will start taking shape.';
  $('emptyAdd').classList.toggle('hidden', !!keyword);

  $('movieList').innerHTML = list.map((m, i) => {
    const rating = Number(m.rating);
    const details = [
      m.year,
      m.watched_on ? 'Watched ' + formatDay(m.watched_on) : null
    ].filter(Boolean);

    return `<article class="movie-card">
      <div class="rank">${String(i + 1).padStart(2, '0')}</div>
      ${posterMarkup(m.poster_url, 'poster', m.title)}
      <div class="movie-info">
        <div class="movie-title">${esc(m.title)}</div>
        <div class="movie-meta">${esc(details.join(' · ') || 'Film')}</div>
        ${m.review
          ? `<p class="review">${esc(m.review)}</p>`
          : '<p class="no-review">No review added</p>'}
        ${safeUrl(m.source_url)
          ? `<a class="source-link" href="${esc(safeUrl(m.source_url))}" target="_blank" rel="noopener noreferrer">Movie details ↗</a>`
          : ''}
      </div>
      <div class="movie-end">
        <div class="score ${rating >= 9 ? 'excellent' : rating >= 7 ? 'good' : ''}">
          <strong>${scoreText(rating)}</strong><span>/ 10</span>
        </div>
        <button class="edit-btn" data-edit="${esc(m.id)}" aria-label="Edit ${esc(m.title)}">
          Edit <span>↗</span>
        </button>
      </div>
    </article>`;
  }).join('');
}

function openModal(movie = null) {
  clearTimeout(searchTimer);
  searchVersion++;
  editing = movie?.id || null;

  $('movieForm').reset();
  $('movieId').value = editing || '';
  $('modalTitle').textContent = editing ? 'Edit movie' : 'Add a movie';
  $('saveMovie').innerHTML = editing ? 'Save changes <span>↗</span>' : 'Save movie <span>↗</span>';
  $('deleteMovie').classList.toggle('hidden', !editing);
  $('suggestions').classList.add('hidden');
  $('suggestions').innerHTML = '';
  $('posterStatus').textContent = "We'll search for its poster automatically.";

  selectedPoster = movie?.poster_url || '';
  selectedSource = movie?.source_url || '';

  if (movie) {
    $('title').value = movie.title;
    $('year').value = movie.year || '';
    $('posterUrl').value = movie.poster_url || '';
    $('rating').value = Number(movie.rating);
    $('watched').value = movie.watched_on || '';
    $('review').value = movie.review || '';
  }

  updateRating();
  updatePreview();
  $('overlay').classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => $('title').focus(), 120);
}

function closeModal() {
  $('overlay').classList.add('hidden');
  document.body.classList.remove('modal-open');
  editing = null;
  clearTimeout(searchTimer);
  searchVersion++;
}

function updateRating() {
  const n = Number($('rating').value);
  $('ratingDisplay').innerHTML = `${scoreText(n)} <span>/ 10</span>`;
  $('rating').style.setProperty('--fill', (n * 10) + '%');

  document.querySelectorAll('[data-score]').forEach(b =>
    b.classList.toggle('active', Number(b.dataset.score) === n)
  );
}

function updatePreview() {
  $('posterPreview').innerHTML = posterMarkup(
    selectedPoster, 'preview-art', $('title').value
  );
}

function appleArt(url) {
  return safeUrl((url || '').replace(/100x100bb\./, '600x900bb.'));
}

function searchAppleMovies(term) {
  return new Promise((resolve, reject) => {
    const callback = 'movieSearch_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    let done = false;

    const finish = (error, data) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      delete window[callback];
      script.remove();
      error ? reject(error) : resolve(data || []);
    };

    const timeout = setTimeout(() => finish(new Error('Poster search timed out')), 8000);
    window[callback] = payload => finish(null, payload.results || []);
    script.onerror = () => finish(new Error('Poster search is unavailable'));
    script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=movie&entity=movie&limit=8&country=US&callback=${callback}`;
    document.head.appendChild(script);
  });
}

function chooseResult(movie) {
  selectedPoster = movie.poster;
  selectedSource = movie.source;
  $('posterUrl').value = selectedPoster;

  if (movie.year) $('year').value = movie.year;
  updatePreview();

  document.querySelectorAll('.suggestion').forEach(button =>
    button.classList.toggle('selected', button.dataset.id === movie.id)
  );

  $('posterStatus').textContent = 'Poster found. Select a different match below if needed.';
}

async function lookupPoster() {
  const query = $('title').value.trim();
  const version = ++searchVersion;

  if (query.length < 3) {
    $('suggestions').classList.add('hidden');
    return;
  }

  $('posterStatus').textContent = 'Searching for a poster...';

  try {
    const results = (await searchAppleMovies(query)).map(item => ({
      id: String(item.trackId || ''),
      title: item.trackName || '',
      year: item.releaseDate ? Number(item.releaseDate.slice(0, 4)) : null,
      poster: appleArt(item.artworkUrl100),
      source: safeUrl(item.trackViewUrl)
    })).filter(m => m.poster && m.title);

    if (version !== searchVersion || $('overlay').classList.contains('hidden')) return;

    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    results.sort((a, b) =>
      Number(normalize(b.title) === normalize(query)) -
      Number(normalize(a.title) === normalize(query)) ||
      Number(normalize(b.title).startsWith(normalize(query))) -
      Number(normalize(a.title).startsWith(normalize(query)))
    );

    const list = results.slice(0, 5);

    $('suggestions').innerHTML = list.map(m => `
      <button type="button" class="suggestion" data-id="${esc(m.id)}">
        ${posterMarkup(m.poster, 'suggestion-art', m.title)}
        <span><strong>${esc(m.title)}</strong><small>${m.year || 'Movie'}</small></span>
      </button>
    `).join('');

    $('suggestions').classList.toggle('hidden', !list.length);

    if (list.length) {
      chooseResult(list[0]);
      $('suggestions').querySelectorAll('.suggestion').forEach((button, i) =>
        button.addEventListener('click', () => chooseResult(list[i]))
      );
    } else {
      $('posterStatus').textContent = 'No poster found. You can paste a poster URL manually.';
    }
  } catch {
    if (version === searchVersion) {
      $('posterStatus').textContent = 'Poster lookup unavailable. You can paste a poster URL manually.';
    }
  }
}

async function saveMovie(event) {
  event.preventDefault();

  const title = $('title').value.trim();
  const year = $('year').value ? Number($('year').value) : null;

  if (!title) return notify('Enter a movie title');
  if (year !== null && (year < 1888 || year > 2200)) return notify('Enter a valid release year');
  if ($('posterUrl').value && !safeUrl($('posterUrl').value)) {
    return notify('Poster URL must start with https://');
  }

  const payload = {
    title,
    year,
    poster_url: safeUrl($('posterUrl').value) || null,
    source_url: selectedSource || null,
    rating: Number($('rating').value),
    review: $('review').value.trim(),
    watched_on: $('watched').value || null
  };

  const button = $('saveMovie');
  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    await cloud('save', {id: editing || null, movie: payload});
    const wasEditing = !!editing;
    closeModal();
    notify(wasEditing ? 'Movie updated' : 'Movie added');
    await loadMovies();
  } catch (error) {
    notify('Could not save: ' + error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = editing ? 'Save changes <span>↗</span>' : 'Save movie <span>↗</span>';
  }
}

async function deleteMovie() {
  const movie = movies.find(m => m.id === editing);
  if (!movie || !confirm(`Delete "${movie.title}" from your rankings?`)) return;

  const button = $('deleteMovie');
  button.disabled = true;
  button.textContent = 'Deleting...';

  try {
    await cloud('delete', {id: editing});
    closeModal();
    notify('Movie deleted');
    await loadMovies();
  } catch (error) {
    notify('Could not delete: ' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Delete';
  }
}

$('shareLink').addEventListener('click', copySyncLink);
$('addButton').addEventListener('click', () => openModal());
$('emptyAdd').addEventListener('click', () => openModal());
$('closeModal').addEventListener('click', closeModal);
$('cancel').addEventListener('click', closeModal);

$('overlay').addEventListener('click', event => {
  if (event.target === $('overlay')) closeModal();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('overlay').classList.contains('hidden')) closeModal();
});

$('search').addEventListener('input', render);
$('sort').addEventListener('change', render);

$('movieList').addEventListener('click', event => {
  const button = event.target.closest('[data-edit]');
  if (button) openModal(movies.find(m => m.id === button.dataset.edit));
});

$('movieForm').addEventListener('submit', saveMovie);
$('deleteMovie').addEventListener('click', deleteMovie);
$('rating').addEventListener('input', updateRating);

document.querySelectorAll('[data-score]').forEach(button =>
  button.addEventListener('click', () => {
    $('rating').value = button.dataset.score;
    updateRating();
  })
);

$('posterUrl').addEventListener('input', () => {
  selectedPoster = safeUrl($('posterUrl').value);
  selectedSource = '';
  updatePreview();
});

$('title').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchVersion++;
  selectedPoster = '';
  selectedSource = '';
  $('posterUrl').value = '';
  updatePreview();
  $('suggestions').classList.add('hidden');
  $('posterStatus').textContent = "We'll search for its poster automatically.";

  if ($('title').value.trim().length >= 3) {
    searchTimer = setTimeout(lookupPoster, 650);
  }
});

document.addEventListener('error', event => {
  if (event.target.matches('.poster img,.preview-art img,.suggestion-art img')) {
    event.target.remove();
  }
}, true);

initialize();
