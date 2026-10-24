const results = document.querySelector('#results');
const el = (tag, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
const money = value => new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(value);
let saved;
try { saved = JSON.parse(localStorage.getItem('cinema-duca-reservations') ?? '[]'); } catch { saved = []; }
if (!Array.isArray(saved)) saved = [];
saved = saved.filter(r => r && typeof r.id === 'string' && typeof r.sessionId === 'string' && Array.isArray(r.seats) && typeof r.cancellationToken === 'string');
function remember() { try { localStorage.setItem('cinema-duca-reservations', JSON.stringify(saved)); } catch { /* Receipt remains available on this page. */ } }
async function request(path, body) {
  const response = await fetch(path, body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {cache:'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Não foi possível concluir. Tente novamente.');
  return data;
}
function reservationPanel(session) {
  const panel = el('section');
  panel.setAttribute('aria-label', `Reservas ${session.id}`);
  const status = el('p'); status.className='status';status.setAttribute('role','status');
  const controls = el('div');
  const receipts = el('div');
  panel.append(controls, receipts, status);
  let busy = false;
  const enabled = session.reservationMode === 'local-json';
  async function refresh() {
    try {
      const data = await request(`/api/sessions?movieId=${encodeURIComponent(session.movieId)}`);
      const updated = data.sessions.find(item => item.id === session.id);
      if (updated) session = updated;
    } catch { status.textContent += ' Não foi possível atualizar os assentos. Recarregue antes de outra reserva.'; }
    render();
  }
  async function cancel(id, token) {
    if (busy) return;
    busy=true;render();status.textContent='Cancelando…';
    try {
      await request('/api/reservations/cancel',{reservationId:id,cancellationToken:token});
      saved=saved.filter(r=>r.id!==id);remember();status.textContent='Reserva cancelada. Os assentos foram liberados.';
      await refresh();
    } catch(error) {status.textContent=error.message;}
    finally {busy=false;render();}
  }
  function render() {
    controls.replaceChildren();receipts.replaceChildren();
    const details=el('details');
    details.append(el('summary',`${session.availableSeats.length} assentos disponíveis`),el('p',session.availableSeats.join(' · ')));
    controls.append(details);
    const form=el('form');form.className='reservation-form';
    const fieldset=el('fieldset');fieldset.disabled=busy||!enabled;
    fieldset.append(el('legend','Escolha seus assentos'));
    const seats=el('div');seats.className='seats';
    for (const seat of session.availableSeats) {
      const label=el('label');const input=document.createElement('input');input.type='checkbox';input.name='seat';input.value=seat;
      label.append(input,document.createTextNode(seat));seats.append(label);
    }
    fieldset.append(seats);
    if (!session.availableSeats.length) fieldset.append(el('p','Sessão sem assentos disponíveis.'));
    const reserve=el('button','Reservar');reserve.type='submit';reserve.disabled=busy||!enabled||!session.availableSeats.length;
    const total=el('p','Selecione os assentos para calcular o total.');
    form.append(fieldset,total,reserve);
    form.addEventListener('change',()=>{const count=form.querySelectorAll('input:checked').length;total.textContent=`${count} ingresso(s) · Total: ${money(count*session.priceBRL)}`;});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy||!enabled)return;
      const selected=Array.from(form.querySelectorAll('input:checked'),input=>input.value);
      if(!selected.length){status.textContent='Selecione pelo menos um assento.';return;}
      busy=true;render();status.textContent='Reservando…';
      try {
        const {reservation}=await request('/api/reservations',{sessionId:session.id,seats:selected});
        saved.push(reservation);remember();status.textContent='Reserva confirmada! Guarde os dados abaixo para cancelar.';
        await refresh();
      }catch(error){status.textContent=error.message;await refresh();}
      finally{busy=false;render();}
    });
    controls.append(form);
    if(!enabled)controls.append(el('p','Reservar e cancelar estão disponíveis apenas no servidor local. Este site está em modo de consulta.'));
    for(const reservation of saved.filter(r=>r.sessionId===session.id)) {
      const receipt=el('div');receipt.className='receipt';
      receipt.append(el('strong',`Reserva · ${reservation.seats.join(', ')} · ${money(reservation.totalBRL)}`));
      const codes=el('details');codes.append(el('summary','Dados para cancelamento'),el('p','Guarde estes dados. O código permite cancelar sua reserva; não o compartilhe.'),el('p','Número da reserva:'),el('code',reservation.id),el('p','Código de cancelamento:'),el('code',reservation.cancellationToken));
      const button=el('button','Cancelar reserva');button.type='button';button.disabled=busy||!enabled;
      button.addEventListener('click',()=>void cancel(reservation.id,reservation.cancellationToken));
      receipt.append(codes,button);receipts.append(receipt);
    }
    const manual=el('details');manual.append(el('summary','Cancelar outra reserva com código'));
    const cancelForm=el('form');cancelForm.className='cancel-form';
    const idLabel=el('label','Número da reserva');const id=document.createElement('input');id.required=true;idLabel.append(id);
    const tokenLabel=el('label','Código de cancelamento');const token=document.createElement('input');token.required=true;token.type='password';token.autocomplete='off';tokenLabel.append(token);
    id.disabled=token.disabled=busy||!enabled;
    const cancelButton=el('button','Cancelar reserva');cancelButton.type='submit';cancelButton.disabled=busy||!enabled;
    cancelForm.append(idLabel,tokenLabel,cancelButton);
    cancelForm.addEventListener('submit',event=>{event.preventDefault();if(enabled)void cancel(id.value.trim(),token.value.trim());});
    const openCancel=el('button','Cancelar reserva');openCancel.type='button';openCancel.disabled=busy||!enabled;openCancel.addEventListener('click',()=>{manual.open=!manual.open;if(manual.open)id.focus();});
    manual.append(cancelForm);controls.append(openCancel,manual);
  }
  render();return panel;
}
async function load(applyFilters=false) {
  results.textContent='Carregando…';
  try {
    const params=new URLSearchParams(Object.fromEntries(['query','genre','actor','year'].map(id=>[id,applyFilters?document.querySelector(`#${id}`).value:''])));
    const [{movies},{sessions}]=await Promise.all([request('/api/movies?'+params),request('/api/sessions')]);
    document.querySelector('#catalog-title').textContent=applyFilters&&Array.from(params.values()).some(Boolean)?'Resultados da busca':'Todos os filmes';
    results.replaceChildren();if(!movies.length)results.textContent='Nenhum filme encontrado.';
    for(const movie of movies) {
      const card=el('article');card.append(el('h2',movie.title),el('small',`${movie.year} · ${movie.genre} · ${movie.durationMinutes} min · Classificação: ${movie.ageRating===0?'Livre':movie.ageRating+' anos'}`),el('p',movie.synopsis),el('p',`Direção: ${movie.director} · Elenco: ${movie.cast.join(', ')}`));
      if(movie.protagonist) {
        const figure=el('figure');const image=document.createElement('img');image.src=movie.protagonist.imageUrl;image.alt=movie.protagonist.imageAlt;image.width=1086;image.height=1448;image.loading='lazy';image.decoding='async';
        figure.append(image,el('figcaption',`${movie.protagonist.name} · Protagonista fictícia · Imagem criada com IA`));card.append(figure);
      }
      const screenings=sessions.filter(session=>session.movieId===movie.id);
      if(!screenings.length)card.append(el('p','Sem sessões programadas.'));
      for(const session of screenings) {
        const block=el('div',`${session.date.split('-').reverse().join('/')} às ${session.time} · ${session.roomName} · ${money(session.priceBRL)}`);block.className='session';block.append(reservationPanel(session));card.append(block);
      }
      results.append(card);
    }
  }catch{results.textContent='Não foi possível carregar os dados. Tente novamente.';}
}
document.querySelector('#search').addEventListener('submit',event=>{event.preventDefault();void load(true);});
document.querySelector('#show-all').addEventListener('click',()=>{document.querySelector('#search').reset();void load();});
void load();
