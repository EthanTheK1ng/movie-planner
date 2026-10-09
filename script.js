// Connected to your existing Supabase project. This publishable key is safe in frontend code.
const SUPABASE_URL = 'https://edcmnuriwutqxprzhkhz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_22TfmhqUAKMqUIIk_H2qDg_12gWaj2e';
const $ = id => document.getElementById(id);
const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
let movies = [], userId = null, channel = null, editing = null;
let selectedPoster = '', selectedSource = '', searchTimer, searchVersion = 0, toastTimer;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
const scoreText = number => Number(number).toFixed(1);
const formatDay = date => date ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '';
const notify = message => { const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3400); };

async function initialize() {
  if (!db) { $('authPage').classList.remove('hidden'); $('authMessage').textContent='Could not load Supabase. Check your internet connection.'; return; }
  db.auth.onAuthStateChange((_event, session) => setTimeout(() => setSession(session), 0));
  const {data:{session},error} = await db.auth.getSession();
  if (error) notify(error.message);
  setSession(session);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
function setSession(session) {
  const nextId = session?.user?.id ?? null;
  $('authPage').classList.toggle('hidden', !!nextId);
  $('app').classList.toggle('hidden', !nextId);
  if (nextId === userId) return;
  userId = nextId; movies = []; render();
  if (channel) { db.removeChannel(channel); channel = null; }
  if (!userId) { closeModal(); return; }
  loadMovies(true);
  channel = db.channel('movie-ratings-' + userId)
    .on('postgres_changes', {event:'*',schema:'public',table:'movie_ratings',filter:'user_id=eq.'+userId}, () => loadMovies(false))
    .subscribe();
}
async function loadMovies(showLoading = false) {
  if (!userId) return;
  const requestedUser = userId;
  if (showLoading) $('loading').classList.remove('hidden');
  const {data,error} = await db.from('movie_ratings').select('*').eq('user_id',requestedUser).order('created_at',{ascending:false});
  if (requestedUser !== userId) return;
  $('loading').classList.add('hidden');
  if (error) { notify('Could not load movies: ' + error.message); return; }
  movies = data || [];
  render();
}
function posterMarkup(url, className, title = '') {
  const src = safeUrl(url);
  return `<div class="${className}"><span class="fallback-art">✦</span>${src ? `<img src="${esc(src)}" alt="${esc(title)} poster" loading="lazy">` : ''}</div>`;
}
function render() {
  const total = movies.length;
  $('movieCount').textContent = total;
  $('totalPill').textContent = total;
  $('averageScore').textContent = total ? scoreText(movies.reduce((a,m)=>a+Number(m.rating),0)/total) : '—';
  $('topScore').textContent = total ? scoreText(Math.max(...movies.map(m=>Number(m.rating)))) : '—';
  const keyword = $('search').value.trim().toLowerCase();
  const list = movies.filter(m => (m.title+' '+(m.year||'')+' '+(m.review||'')).toLowerCase().includes(keyword));
  const sort = $('sort').value;
  list.sort((a,b) => {
    if (sort==='highest') return Number(b.rating)-Number(a.rating) || a.title.localeCompare(b.title);
    if (sort==='lowest') return Number(a.rating)-Number(b.rating) || a.title.localeCompare(b.title);
    if (sort==='title') return a.title.localeCompare(b.title);
    if (sort==='year') return (b.year||0)-(a.year||0);
    return new Date(b.created_at)-new Date(a.created_at);
  });
  $('empty').classList.toggle('hidden', !!list.length || $('loading').offsetParent !== null);
  $('empty').querySelector('h3').textContent = keyword ? 'No matching movies' : 'No movies here yet';
  $('empty').querySelector('p').textContent = keyword ? 'Try a different title or search term.' : 'Add your first rating, and your collection will start taking shape.';
  $('emptyAdd').classList.toggle('hidden', !!keyword);
  $('movieList').innerHTML = list.map((m,i) => {
    const rating=Number(m.rating), details=[m.year, m.watched_on ? 'Watched '+formatDay(m.watched_on) : null].filter(Boolean);
    return `<article class="movie-card">
      <div class="rank">${String(i+1).padStart(2,'0')}</div>
      ${posterMarkup(m.poster_url, 'poster', m.title)}
      <div class="movie-info"><div class="movie-title">${esc(m.title)}</div><div class="movie-meta">${esc(details.join(' · ') || 'Film')}</div>
      ${m.review ? `<p class="review">${esc(m.review)}</p>` : '<p class="no-review">No review added</p>'}
      ${safeUrl(m.source_url) ? `<a class="source-link" href="${esc(safeUrl(m.source_url))}" target="_blank" rel="noopener noreferrer">Movie details ↗</a>` : ''}</div>
      <div class="movie-end"><div class="score ${rating>=9?'excellent':rating>=7?'good':''}"><strong>${scoreText(rating)}</strong><span>/ 10</span></div><button class="edit-btn" data-edit="${esc(m.id)}" aria-label="Edit ${esc(m.title)}">Edit <span>↗</span></button></div>
    </article>`;
  }).join('');
}

async function sendSignIn(event) {
  event.preventDefault();
  const email=$('email').value.trim();
  const button=$('authButton'); button.disabled=true; button.textContent='Sending link...';
  const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
  button.disabled=false; button.innerHTML='Send sign-in link <span>↗</span>';
  $('authMessage').textContent=error ? error.message : 'Check your inbox! Open the link on this device to sign in.';
  if (!error) notify('Sign-in link sent');
}
function openModal(movie = null) {
  clearTimeout(searchTimer); searchVersion++;
  editing=movie?.id||null;
  $('movieForm').reset(); $('movieId').value=editing||'';
  $('modalTitle').textContent=editing?'Edit movie':'Add a movie';
  $('saveMovie').innerHTML=editing?'Save changes <span>↗</span>':'Save movie <span>↗</span>';
  $('deleteMovie').classList.toggle('hidden',!editing);
  $('suggestions').classList.add('hidden'); $('suggestions').innerHTML='';
  $('posterStatus').textContent="We'll search for its poster automatically.";
  selectedPoster=movie?.poster_url||''; selectedSource=movie?.source_url||'';
  if (movie) {
    $('title').value=movie.title; $('year').value=movie.year||'';
    $('posterUrl').value=movie.poster_url||''; $('rating').value=Number(movie.rating);
    $('watched').value=movie.watched_on||''; $('review').value=movie.review||'';
  }
  updateRating(); updatePreview();
  $('overlay').classList.remove('hidden'); document.body.classList.add('modal-open');
  setTimeout(()=>$('title').focus(),120);
}
function closeModal() { $('overlay').classList.add('hidden'); document.body.classList.remove('modal-open'); editing=null; clearTimeout(searchTimer); searchVersion++; }
function updateRating() {
  const n=Number($('rating').value);
  $('ratingDisplay').innerHTML=`${scoreText(n)} <span>/ 10</span>`;
  $('rating').style.setProperty('--fill',(n*10)+'%');
  document.querySelectorAll('[data-score]').forEach(b=>b.classList.toggle('active',Number(b.dataset.score)===n));
}
function updatePreview() { $('posterPreview').innerHTML=posterMarkup(selectedPoster,'preview-art',$('title').value); }

function appleArt(url) { return safeUrl((url||'').replace(/100x100bb\./,'600x900bb.')); }
function searchAppleMovies(term) {
  // Apple's official Search API offers JSONP, so this works without an API key or CORS proxy.
  return new Promise((resolve,reject)=>{
    const callback='movieSearch_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const script=document.createElement('script'); let done=false;
    const finish=(error,data)=>{if(done)return;done=true;clearTimeout(timeout);delete window[callback];script.remove();error?reject(error):resolve(data||[]);};
    const timeout=setTimeout(()=>finish(new Error('Poster search timed out')),8000);
    window[callback]=payload=>finish(null,payload.results||[]);
    script.onerror=()=>finish(new Error('Poster search is unavailable'));
    script.src=`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=movie&entity=movie&limit=8&country=US&callback=${callback}`;
    document.head.appendChild(script);
  });
}
function chooseResult(movie) {
  selectedPoster=movie.poster; selectedSource=movie.source;
  $('posterUrl').value=selectedPoster;
  if (movie.year) $('year').value=movie.year;
  updatePreview();
  document.querySelectorAll('.suggestion').forEach(button=>button.classList.toggle('selected',button.dataset.id===movie.id));
  $('posterStatus').textContent='Poster found. Select a different match below if needed.';
}
async function lookupPoster() {
  const query=$('title').value.trim(), version=++searchVersion;
  if(query.length<3){$('suggestions').classList.add('hidden');return;}
  $('posterStatus').textContent='Searching for a poster...';
  try {
    const results=(await searchAppleMovies(query)).map(item=>({
      id:String(item.trackId||''), title:item.trackName||'', year:item.releaseDate?Number(item.releaseDate.slice(0,4)):null,
      poster:appleArt(item.artworkUrl100), source:safeUrl(item.trackViewUrl)
    })).filter(m=>m.poster&&m.title);
    if(version!==searchVersion||$('overlay').classList.contains('hidden'))return;
    const normalize=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
    results.sort((a,b)=>Number(normalize(b.title)===normalize(query))-Number(normalize(a.title)===normalize(query)) || Number(normalize(b.title).startsWith(normalize(query)))-Number(normalize(a.title).startsWith(normalize(query))));
    const list=results.slice(0,5);
    $('suggestions').innerHTML=list.map(m=>`<button type="button" class="suggestion" data-id="${esc(m.id)}">${posterMarkup(m.poster,'suggestion-art',m.title)}<span><strong>${esc(m.title)}</strong><small>${m.year||'Movie'}</small></span></button>`).join('');
    $('suggestions').classList.toggle('hidden',!list.length);
    if(list.length){
      chooseResult(list[0]);
      $('suggestions').querySelectorAll('.suggestion').forEach((button,i)=>button.addEventListener('click',()=>chooseResult(list[i])));
    } else $('posterStatus').textContent='No poster found. You can paste a poster URL manually.';
  } catch(error) { if(version===searchVersion)$('posterStatus').textContent='Poster lookup unavailable. You can paste a poster URL manually.'; }
}
async function saveMovie(event) {
  event.preventDefault();
  const title=$('title').value.trim(), year=$('year').value?Number($('year').value):null;
  if(!title)return notify('Enter a movie title');
  if(year!==null&&(year<1888||year>2200))return notify('Enter a valid release year');
  if($('posterUrl').value && !safeUrl($('posterUrl').value))return notify('Poster URL must start with https://');
  const payload={title,year,poster_url:safeUrl($('posterUrl').value)||null,source_url:selectedSource||null,
    rating:Number($('rating').value),review:$('review').value.trim(),watched_on:$('watched').value||null,updated_at:new Date().toISOString()};
  const button=$('saveMovie');button.disabled=true;button.textContent='Saving...';
  const {error}= editing
    ? await db.from('movie_ratings').update(payload).eq('id',editing).eq('user_id',userId)
    : await db.from('movie_ratings').insert({...payload,user_id:userId});
  button.disabled=false;button.innerHTML=editing?'Save changes <span>↗</span>':'Save movie <span>↗</span>';
  if(error)return notify('Could not save: '+error.message);
  const wasEditing=!!editing;closeModal();notify(wasEditing?'Movie updated':'Movie added');await loadMovies(false);
}
async function deleteMovie() {
  const movie=movies.find(m=>m.id===editing);
  if(!movie||!confirm(`Delete "${movie.title}" from your rankings?`))return;
  const button=$('deleteMovie');button.disabled=true;button.textContent='Deleting...';
  const {error}=await db.from('movie_ratings').delete().eq('id',editing).eq('user_id',userId);
  button.disabled=false;button.textContent='Delete';
  if(error)return notify('Could not delete: '+error.message);
  closeModal();notify('Movie deleted');await loadMovies(false);
}

$('authForm').addEventListener('submit',sendSignIn);
$('signOut').addEventListener('click',async()=>{const {error}=await db.auth.signOut();if(error)notify(error.message);});
$('addButton').addEventListener('click',()=>openModal());
$('emptyAdd').addEventListener('click',()=>openModal());
$('closeModal').addEventListener('click',closeModal);
$('cancel').addEventListener('click',closeModal);
$('overlay').addEventListener('click',event=>{if(event.target===$('overlay'))closeModal();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('overlay').classList.contains('hidden'))closeModal();});
$('search').addEventListener('input',render);
$('sort').addEventListener('change',render);
$('movieList').addEventListener('click',event=>{const button=event.target.closest('[data-edit]');if(button)openModal(movies.find(m=>m.id===button.dataset.edit));});
$('movieForm').addEventListener('submit',saveMovie);
$('deleteMovie').addEventListener('click',deleteMovie);
$('rating').addEventListener('input',updateRating);
document.querySelectorAll('[data-score]').forEach(button=>button.addEventListener('click',()=>{$('rating').value=button.dataset.score;updateRating();}));
$('posterUrl').addEventListener('input',()=>{selectedPoster=safeUrl($('posterUrl').value);selectedSource='';updatePreview();});
$('title').addEventListener('input',()=>{
  clearTimeout(searchTimer);searchVersion++;selectedPoster='';selectedSource='';$('posterUrl').value='';updatePreview();
  $('suggestions').classList.add('hidden');$('posterStatus').textContent="We'll search for its poster automatically.";
  if($('title').value.trim().length>=3)searchTimer=setTimeout(lookupPoster,650);
});
document.addEventListener('error',event=>{if(event.target.matches('.poster img,.preview-art img,.suggestion-art img'))event.target.remove();},true);
initialize();
